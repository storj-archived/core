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

  this._server.on('connection', this._handleClient.bind(this));
  events.EventEmitter.call(this);
}

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
  port: 8081,
  server: null,
  maxTunnels: 3
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
  var authID = null;
  var gateway = new TunnelGateway(); // TODO: Pass in SSL options here

  gateway.on('close', function() {
    delete self._gateways[authID];
    self.emit('unlocked');
  });

  gateway.on('open', function(token) {
    authID = token;
    self._gateways[authID] = gateway;

    if (Object.keys(self._gateways).length === self._options.maxTunnels) {
      self.emit('locked');
    }

    self._authorized.push(authID);
    callback(null, gateway);
  });

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

  demuxer.on('error', function(err) {
    client.close(400, { error: err.message });
  });

  demuxer.on('data', function(object) {
    switch (object.type) {
      case 'rpc':
        return gateway.respond(object.data);
      case 'datachannel':
        return gateway.transfer(object.flags.quid, object.data);
      default:
        // NOOP
    }
  });

  muxer.on('error', function(err) {
    client.close(400, { error: err.message });
  });

  muxer.on('data', function(data) {
    client.send(data, { binary: true });
  });

  muxer.source(gateway);

  client.on('message', function(data) {
    demuxer.write(data);
  });
};

module.exports = TunnelServer;
