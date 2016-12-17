'use strict';

const inherits = require('util').inherits;
const kad = require('kad');
const portfinder = require('portfinder');
const natupnp = require('nat-upnp');
const ip = require('ip');
const merge = require('merge');
const utils = require('../utils');
const http = require('http');
const restify = require('restify');
const diglet = require('diglet');
const net = require('net');
const url = require('url');
const ShardServer = require('./shard-server');

/**
 * Custom HTTP transport adapter
 * @constructor
 * @license AGPL-3.0
 * @param {kad.Contact} contact - Contact object to binding to port
 * @param {Object}  options
 * @param {Logger}  options.logger - Logger for diagnositcs
 * @param {Number}  options.maxTunnels - Number of tunnels to provide to network
 * @param {Boolean} options.doNotTraverseNat - Do not try to punch out of NAT
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  options.tunnelGatewayRange.min - Min port for gateway bind
 * @param {Number}  options.tunnelGatewayRange.max - Max port for gateway bind
 * @param {StorageManager} options.storageManager
 * @param {BridgeClient} options.bridgeClient
 */
function Transport(contact, options) {
  if (!(this instanceof Transport)) {
    return new Transport(contact, options);
  }

  this._opts = merge(Object.create(Transport.DEFAULTS), options);
  this._queuedResponses = {};
  this._maxTunnels = this._opts.maxTunnels;
  this._doNotTraverseNat = this._opts.doNotTraverseNat;
  this._tunnelGatewayRange = this._opts.tunnelGatewayRange;
  this._server = restify.createServer({
    name: 'storj',
    handleUpgrades: true
  });

  kad.RPC.call(this, contact, options);
  this.on(
    'MESSAGE_DROP',
    kad.transports.HTTP.prototype._handleDroppedMessage.bind(this)
  );
}

Transport.DEFAULTS = {
  maxTunnels: 3,
  doNotTraverseNat: false,
  tunnelGatewayRange: { min: 0, max: 0 }
};

/**
 * Triggered when the max connections limit is reached
 * @event Transport#connectionLimitReached
 */

inherits(Transport, kad.RPC);

/**
 * Opens the transport, trying UPnP to become publicly addressable and falling
 * back to using a Tunnel
 * @private
 * @param {Function} callback
 */
Transport.prototype._open = function(callback) {
  const self = this;

  this.tunnelServer = new diglet.Server({
    logger: this._log,
    proxyPortRange: this._opts.tunnelGatewayRange,
    proxyMaxConnections: 12,
    maxProxiesAllowed: this._opts.maxTunnels
  });
  this.shardServer = new ShardServer({
    bridgeClient: this._opts.bridgeClient,
    storageManager: this._opts.storageManager,
    logger: this._log,
    nodeID: this._contact.nodeID
  });

  if (self._doNotTraverseNat) {
    self._isPublic = true;

    /* istanbul ignore next */
    self._log.warn(
      'your address is %s and traversal strategies are disabled',
      ip.isPublic(self._contact.address) ? 'public' : 'private'
    );

    return self._bindServer(callback);
  }

  self._requiresTraversal = true;

  function _traverseNat() {
    self._log.warn(
      'you are not publicly reachable, trying traversal strategies...'
    );
    self._forwardPort(function(err, wanip, port) {
      self._isPublic = !err;

      if (self._isPublic) {
        self._contact.port = port || self._contact.port;
        self._log.info('node bound and port mapped: %s', self._contact.port);
      }

      self._bindServer(callback);
      self._contact.address = wanip || self._contact.address;
    });
  }

  self._bindServer(function() {
    self._checkIfReachable(function(isReachable) {
      if (isReachable) {
        return callback(null);
      }

      self._close();
      _traverseNat();
    });
  });
};

/**
 * Sets up server routes
 * @private
 */
Transport.prototype._bindServer = function(callback) {
  const self = this;

  // Disable TCP Nagle algorithm
  self._server.on('connection', (sock) => sock.setNoDelay(true));

  // Middleware
  self._server.use(self._routeTunnelProxies.bind(self));
  self._server.use(restify.CORS());

  // Routes
  self._server.post(
    '/',
    restify.bodyParser(),
    self._handleRPC.bind(self)
  );
  self._server.post(
    '/shards/:hash',
    restify.queryParser(),
    self.shardServer.routeConsignment.bind(self.shardServer)
  );
  self._server.get(
    '/shards/:hash',
    restify.queryParser(),
    self.shardServer.routeRetrieval.bind(self.shardServer)
  );

  self._server.listen(self._contact.port, callback);
};

/**
 * Handles incoming RPC messages
 * @private
 */
Transport.prototype._handleRPC = function(req, res) {
  const self = this;
  let message;

  try {
    message = new kad.Message(req.body);
  } catch (err) {
    res.send(400, new Error('Invalid RPC message'));
    self.receive(null);
    return;
  }

  if (kad.Message.isRequest(message)) {
    self._queuedResponses[message.id] = res;
  }

  self.receive(message.serialize(), {});
};

/**
 * Routes incoming requests to tunnels if any
 * @private
 */
Transport.prototype._routeTunnelProxies = function(req, res, next) {
  var self = this;
  var targetNodeId = req.header('x-storj-node-id');
  var upgradeReq = res.claimUpgrade ? res.claimUpgrade() : null;

  if (!targetNodeId || targetNodeId === self._contact.nodeID) {
    return next();
  }

  if (upgradeReq) {
    self.tunnelServer.routeWebSocketConnection(
      targetNodeId,
      req,
      upgradeReq.socket,
      () => null
    );
  } else {
    self.tunnelServer.routeHttpRequest(
      targetNodeId,
      req,
      res,
      () => null
    );
  }
};

/**
 * Implement the message dispatcher for RPC
 * @private
 */
Transport.prototype._send = function(data, contact) {
  var self = this;
  var parsedMessage = JSON.parse(data.toString());

  if (self._queuedResponses[parsedMessage.id]) {
    self._queuedResponses[parsedMessage.id].send(200, parsedMessage);
    delete self._queuedResponses[parsedMessage.id];
    return;
  }

  if (!contact.valid()) {
    return self.receive(null);
  }

  var client = restify.createJsonClient({
    version: '*',
    url: url.format({
      hostname: contact.address,
      port: contact.port,
      protocol: 'http:'
    }),
    headers: {
      'content-type': 'application/json',
      'x-storj-node-id': contact.nodeID
    },
    agent: new http.Agent({ keepAlive: true, keepAliveMsecs: 25000 }),
    // NB: Disable TCP Nagle algorithm - use `signRequest` options to
    // NB: manipulate the request object before sending
    signRequest: function(req) {
      /* istanbul ignore next */
      req.setNoDelay(true);
    }
  });

  client.post('/', parsedMessage, (err, req, res, data) => {
    if (err) {
      self._log.warn('error returned from remote host: %s', err.message);
      return self.receive(null);
    }

    let message;

    try {
      message = kad.Message(data);
    } catch (err) {
      return self.receive(null);
    }

    self.receive(message.serialize(), {});
  });
};

/**
 * Closes the transport
 * @private
 */
Transport.prototype._close = function() {
  this._server.close();
};

/**
 * Checks if we are publicly reachable
 * @private
 * @param {Function}
 */
Transport.prototype._checkIfReachable = function(callback) {
  if (ip.isPrivate(this._contact.address)) {
    return callback(false);
  }

  var sock = net.connect({
    host: this._contact.address,
    port: this._contact.port
  });

  sock.once('error', () => {
    callback(false);
    sock.removeAllListeners();
    sock.destroy();
  });
  sock.once('connect', () => {
    callback(true);
    sock.removeAllListeners();
    sock.end();
  });
};

/**
 * Creates a port mapping with UPnP
 * @param {Number} port - The port to forward
 * @param {Function} callback - Callback function
 */
Transport.prototype.createPortMapping = function(port, callback) {
  var self = this;
  var natupnpClient = natupnp.createClient();

  natupnpClient.portMapping({
    public: port,
    private: port,
    ttl: 0
  }, function(err) {
    if (err) {
      self._log.warn('could not connect to NAT device via UPnP: %s', port);
      return callback(err);
    }

    natupnpClient.externalIp(function(err, wanip) {
      if (err) {
        self._log.warn('could not obtain public IP address');
        return callback(err);
      }

      if (ip.isPrivate(wanip)) {
        self._log.warn('UPnP device has no public IP address: %s', wanip);
        return callback(new Error('UPnP device has no public IP address'));
      }

      self._log.info('successfully traversed NAT via UPnP: %s:%s', wanip, port);
      callback(null, String(wanip), port);
    });
  });
};

/**
 * Resolve random port to use for opening a gateway
 * @private
 * @param {Number}  port
 * @param {Function} callback
 */
Transport.prototype._getPort = function(callback) {
  var self = this;

  if (self._contact.port) {
    return callback(null, self._contact.port);
  }

  portfinder.basePort = Math.floor(Math.random() * (65535 - 1024) + 1024);
  portfinder.getPort(callback);
};

/**
 * Forwards a port and resolves the public IP
 * @private
 * @param {Function} callback
 */
Transport.prototype._forwardPort = function(callback) {
  var self = this;

  self._getPort(function(err, port) {
    if (err) {
      self._log.warn('could not obtain port');
      return callback(err);
    }

    self.createPortMapping(port, callback);
  });
};

/**
 * Sends the RPC message to the given contact
 * @param {Contact} contact
 * @param {kad.Message} message
 * @param {Function} callback
 */
Transport.prototype.send = function(contact, message, callback) {
  if (kad.Message.isResponse(message)) {
    return kad.RPC.prototype.send.apply(this, arguments);
  }

  if (!utils.isValidContact(contact, !!process.env.STORJ_ALLOW_LOOPBACK)) {
    return callback(new Error('Invalid or forbidden contact address'));
  }

  kad.RPC.prototype.send.apply(this, arguments);
};

module.exports = Transport;
