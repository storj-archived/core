'use strict';

var TunnelGateway = require('./gateway');
var TunnelMuxer = require('./multiplexer');
var TunnelDemuxer = require('./demultiplexer');
var ws = require('ws');
var merge = require('merge');
var url = require('url');
var qs = require('querystring');
var events = require('events');
var inherits = require('util').inherits;

/**
 * Creates a Tunnel server for NATed or firewalled clients to use to join the
 * overlay network.
 * @constructor
 * @param {Object}      options
 * @param {http.Server} options.server - Transport adapter to bind to
 * @param {Number}      options.port - Port to bind if no server provided
 * @param {Number}      options.maxTunnels - Maximum number of gateways to open
 * @param {Object}      options.portRange
 * @param {Number}      options.portRange.min - Starting port to allow gateways
 * @param {Number}      options.portRange.max - Ending port to allow gateways
 */
function TunnelServer(options) {
  if (!(this instanceof TunnelServer)) {
    return new TunnelServer(options);
  }

  this._options = merge(Object.create(TunnelServer.DEFAULTS), options);

  this._serveropts = {
    path: '/tun',
    verifyClient: this._verifyClient.bind(this)
  };

  this._server = new ws.Server(
    this._options.server ?
    merge(this._serveropts, { server: this._options.server }) :
    merge(this._serveropts, { port: this._options.port })
  );

  this._gateways = {}; // NB: {@link TunnelGateway}s keyed by their token
  this._authorized = []; // NB: List of authorized tokens
  this._usedPorts = [];

  this._server.on('connection', this._handleClient.bind(this));
  this._server._server.on('listening', this._emitReady.bind(this));
  events.EventEmitter.call(this);
}

/**
 * Triggered when the server is listening
 * @event TunnelServer#ready
 */

/**
 * Triggered when the server has no more available tunnels
 * @event TunnelServer#locked
 */

/**
 * Triggered when the server has an available tunnel
 * @event TunnelServer#unlocked
 */

inherits(TunnelServer, events.EventEmitter);

TunnelServer.DEFAULTS = {
  port: 0,
  server: null,
  maxTunnels: 3,
  portRange: {
    min: 0, // NB: 0 means use any port
    max: 0  // NB: 0 means use any port
  }
};

/**
 * Creates a new {@link TunnelGateway} and prepares it for use
 * @param {Function} callback - Called on {@link TunnelGateway#event:open}
 */
TunnelServer.prototype.createGateway = function(callback) {
  if (Object.keys(this._gateways).length === this._options.maxTunnels) {
    return callback(new Error('Maximum number of tunnels open'));
  }

  var self = this;
  // TODO: Pass in SSL options into first arg if provided
  var gateway = new TunnelGateway({}, this._getAvailablePort());
  var authID = gateway.getEntranceToken();
  var usedPort = null;

  gateway.on('close', function() {
    delete self._gateways[authID];
    self._usedPorts.splice(self._usedPorts.indexOf(usedPort), 1);
    self.emit('unlocked');
  });

  gateway.on('open', function(token) {
    authID = token;
    self._gateways[authID] = gateway;
    usedPort = gateway.getEntranceAddress().port;

    self._usedPorts.push(usedPort);

    if (Object.keys(self._gateways).length === self._options.maxTunnels) {
      self.emit('locked');
    }

    self._authorized.push(authID);
    callback(null, gateway);
  });

  gateway.on('error', callback);
  gateway.open();
};

/**
 * Returns whether or not this tunnel server has any available tunnels
 * @returns {Boolean}
 */
TunnelServer.prototype.hasTunnelAvailable = function() {
  return Object.keys(this._gateways).length !== this._options.maxTunnels;
};

/**
 * Returns the port the tunnel server is listening on
 * @returns {Number} port
 */
TunnelServer.prototype.getListeningPort = function() {
  return this._server._server.address().port;
};

/**
 * Handles the verfication of a connecting client by the supplied token
 * @private
 * @param {Object} info
 * @param {Function} callback
 * @see https://github.com/websockets/ws/blob/master/doc/ws.md
 */
TunnelServer.prototype._verifyClient = function(info, callback) {
  var token = this._extractTokenFromRequest(info.req);

  if (this._authorized.indexOf(token) === -1) {
    return callback(false, 401);
  }

  this._authorized.splice(this._authorized.indexOf(token), 1);

  callback(true);
};

/**
 * Returns an available port, suitable for opening a gateway
 * @private
 */
TunnelServer.prototype._getAvailablePort = function() {
  if (!this._options.portRange.min) {
    return 0;
  }

  var start = this._options.portRange.min;
  var end = this._options.portRange.max;
  var available = [];

  while (start <= end) {
    available.push(start++);
  }

  for (var i = 0; i < this._usedPorts.length; i++) {
    if (available.indexOf(this._usedPorts[i]) !== -1) {
      available.splice(available.indexOf(this._usedPorts[i]), 1);
    }
  }

  return available[Math.floor(Math.random() * available.length)];
};

/**
 * Extracts the token from the request url
 * @private
 * @param {http.IncomingMessage} req
 */
TunnelServer.prototype._extractTokenFromRequest = function(req) {
  var uriobj = url.parse(req.url);
  var query = qs.parse(uriobj.query);

  return query.token;
};

/**
 * Emits the ready event
 * @private
 */
TunnelServer.prototype._emitReady = function() {
  this.emit('ready');
};

/**
 * Handles an authorized client connection and connects it the the appropriate
 * {@link TunnelGateway} and associated {@link TunnelDemuxer}
 * @private
 * @param {WebSocket} client
 */
TunnelServer.prototype._handleClient = function(client) {
  var token = this._extractTokenFromRequest(client.upgradeReq);

  if (!this._gateways[token]) {
    return client.close(404, { error: 'Gateway no longer open' });
  }

  var gateway = this._gateways[token];
  var muxer = new TunnelMuxer();
  var demuxer = new TunnelDemuxer();

  function cleanup() {
    gateway.close();
    demuxer.removeAllListeners();
    muxer.removeAllListeners();
  }

  demuxer
    .on('error', function(err) {
      client.close(400, { error: err.message });
    })
    .on('data', function(object) {
      switch (object.type) {
        case 'rpc':
          return gateway.respond(object.data);
        case 'datachannel':
          return gateway.transfer(object.flags.quid, object.data);
        default:
          client.close(400, { error: 'Cannot handle tunnel frame type' });
      }
    });

  muxer
    .on('error', function(err) {
      client.close(400, { error: err.message });
    })
    .on('data', function(data) {
      client.send(data, { binary: true });
    })
    .source(gateway);

  client
    .on('message', function(data) {
      demuxer.write(data);
    })
    .on('close', cleanup)
    .on('error', cleanup);
};

module.exports = TunnelServer;
