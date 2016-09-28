'use strict';

var inherits = require('util').inherits;
var kad = require('kad');
var portfinder = require('portfinder');
var natupnp = require('nat-upnp');
var ip = require('ip');
var TunnelServer = require('../tunnel/server');
var merge = require('merge');
var utils = require('../utils');
var ContactChecker = require('./contact-checker');

/**
 * Custom HTTP transport adapter
 * @constructor
 * @license AGPL-3.0
 * @param {kad.Contact} contact - Contact object to binding to port
 * @param {Object}  options
 * @param {Logger}  options.logger - Logger for diagnositcs
 * @param {Boolean} options.cors - Enable cross origin resource sharing
 * @param {Number}  options.maxTunnels - Number of tunnels to provide to network
 * @param {Boolean} options.doNotTraverseNat - Do not try to punch out of NAT
 * @param {Number}  options.tunnelServerPort - Port for tunnel server to bind
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  options.tunnelGatewayRange.min - Min port for gateway bind
 * @param {Number}  options.tunnelGatewayRange.max - Max port for gateway bind
 * @param {Number}  options.maxConnections - Limit concurrent connections
 */
function Transport(contact, options) {
  if (!(this instanceof Transport)) {
    return new Transport(contact, options);
  }

  options = merge(Object.create(Transport.DEFAULTS), options);

  this._maxTunnels = options.maxTunnels;
  this._tunnelServerPort = options.tunnelServerPort || 0;
  this._doNotTraverseNat = options.doNotTraverseNat;
  this._tunnelGatewayRange = options.tunnelGatewayRange;
  this._numConnections = 0;
  this._maxConnections = options.maxConnections;

  kad.transports.HTTP.call(this, contact, options);
  this._bindTunnelServer();
}

Transport.DEFAULTS = {
  maxTunnels: 3,
  tunnelServerPort: 0,
  doNotTraverseNat: false,
  tunnelGatewayRange: { min: 0, max: 0 },
  maxConnections: 100
};

/**
 * Triggered when the max connections limit is reached
 * @event Transport#connectionLimitReached
 */

inherits(Transport, kad.transports.HTTP);

/**
 * Opens the transport, trying UPnP to become publicly addressable and falling
 * back to using a Tunnel
 * @private
 * @param {Function} callback
 */
Transport.prototype._open = function(callback) {
  var self = this;

  if (self._doNotTraverseNat) {
    self._isPublic = true;

    /* istanbul ignore next */
    self._log.warn(
      'your address is %s and traversal strategies are disabled',
      ip.isPublic(self._contact.address) ? 'public' : 'private'
    );

    kad.transports.HTTP.prototype._open.call(self, callback);
    self._setLimitOnConnections();
    return;
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

      kad.transports.HTTP.prototype._open.call(self, callback);
      self._contact.address = wanip || self._contact.address;
    });
  }

  kad.transports.HTTP.prototype._open.call(self, function() {
    self._checkIfReachable(function(isReachable) {
      if (isReachable) {
        return callback(null);
      }

      kad.transports.HTTP.prototype._close.call(self);
      _traverseNat();
    });
  });
  self._setLimitOnConnections();
};

/**
 * Sets a limit to the number of concurrent connections
 * @private
 */
Transport.prototype._setLimitOnConnections = function() {
  var self = this;

  this._server.on('connection', function(socket) {
    if (self._numConnections >= self._maxConnections) {
      self._log.warn('connection limit reached, destroying socket');
      socket.destroy();
      return self.emit('connectionLimitReached');
    }

    socket.on('close', function() {
      self._numConnections--;
    });

    self._numConnections++;
  });
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

  var checker = new ContactChecker();

  checker.check(this._contact, function(err) {
    if (err) {
      return callback(false);
    }

    callback(true);
  });
};

/**
 * Closes the underyling transport and tunnel server
 * @private
 * @param {Function} callback
 */
Transport.prototype._close = function(callback) {
  this.tunnelServer.close();
  kad.transports.HTTP.prototype._close.call(this, callback);
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
 * Set up a local tunnel server
 * @private
 */
Transport.prototype._bindTunnelServer = function() {
  var self = this;

  this._log.info(
    'you are configured to tunnel up to %s connections',
    this._maxTunnels
  );

  this.tunnelServer = new TunnelServer({
    maxTunnels: this._maxTunnels,
    serverPort: this._tunnelServerPort,
    gatewayPortRange: this._tunnelGatewayRange,
    logger: self._log
  });

  this.tunnelServer.on('ready', function() {
    if (self._isPublic) {
      return;
    }

    self.createPortMapping(this.getListeningPort(), function(err, ip, port) {
      if (err) {
        self._log.warn('failed to map port for tunserver: %s', err.message);
      } else {
        self._log.info('tunnel server bound and port mapped: %s', port);
      }
    });
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
    return kad.transports.HTTP.prototype.send.apply(this, arguments);
  }

  if (!utils.isValidContact(contact, !!process.env.STORJ_ALLOW_LOOPBACK)) {
    return callback(new Error('Invalid or forbidden contact address'));
  }

  kad.transports.HTTP.prototype.send.apply(this, arguments);
};

module.exports = Transport;
