'use strict';

var kad = require('kad');
var http = require('http');
var https = require('https');
var ws = require('ws');
var events = require('events');
var inherits = require('util').inherits;
var crypto = require('crypto');

/**
 * Creates a tunnel gateway and emits manages entry and exit messages
 * @constructor
 * @param {Object} options - Options to pass to http.Server/https.Server
 * @fires TunnelGateway#message/rpc
 * @fires TunnelGateway#message/datachannel
 */
function TunnelGateway(options) {
  if (!(this instanceof TunnelGateway)) {
    return new TunnelGateway(options);
  }

  this._options = options || {};
  this._server = this._options.cert && this._options.key ?
                 https.createServer(this._options, this._handleRPC.bind(this)) :
                 http.createServer(this._handleRPC.bind(this));
  this._websock = new ws.Server({ server: this._server });

  // Manages pending RPC responses
  this._responses = {};

  // Manages open data channel sockets
  this._channels = {};

  this.token = crypto.randomBytes(32).toString('hex');
}

/**
 * Triggered when a message is received over RPC
 * @event TunnelGateway#message/rpc
 * @param {Object} message - The parsed RPC message received
 */

/**
 * Triggered when the gateway is opened
 * @event TunnelGateway#open
 */

/**
 * Triggered when the gateway is closed
 * @event TunnelGateway#close
 */

/**
 * Triggered when a message is received over a datachannel
 * @event TunnelGateway#message/datachannel
 * @param {Buffer|String} data - The data frame received
 * @param {Object} flags - WebSocket flags included
 * @param {Boolean} flags.binary - Frame was sent with 0x02 opcode
 * @param {String} flags.quid - Quasi-unique ID assigned to this socket
 */

inherits(TunnelGateway, events.EventEmitter);

/**
 * Returns the alias data for the gateway
 * @returns {Object|null} alias
 */
TunnelGateway.prototype.getEntranceAddress = function() {
  var addr = this._server.address();

  if (addr === null) {
    return addr;
  }

  return {
    address: addr.address,
    port: addr.port
  };
};

/**
 * Returns the authorization token for this gateway
 * @returns {Object} alias
 */
TunnelGateway.prototype.getEntranceToken = function() {
  return this.token;
};

/**
 * Dispatches the supplied response the the given pending RPC by ID
 * @param {Object} message - The JSON-RPC message response
 * @returns {Boolean} sent - Whether or not the message was sent
 */
TunnelGateway.prototype.respond = function(message) {
  var response = kad.Message(message);

  if (!this._responses[message.id]) {
    return false;
  }

  try {
    this._responses[message.id].end(response.serialize());
    delete this._responses[message.id];
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Writes the supplied data to the socket at the given quid
 * @param {String} quid - The quasi-unique socket identifier
 * @param {String|Buffer} - The data to be transferred
 * @returns {Boolean} sent - Whether or not the data was transferred
 */
TunnelGateway.prototype.transfer = function(quid, data) {
  var flags = { binary: Buffer.isBuffer(data) };

  if (!this._channels[quid]) {
    return false;
  }

  try {
    this._channels[quid].send(data, flags);
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Terminates the specified channel
 * @param {String} quid - The quasi-unique socket identifier
 * @returns {Boolean} terminated - Whether or not the channel was terminated
 */
TunnelGateway.prototype.terminate = function(quid) {
  if (!this._channels[quid]) {
    return false;
  }

  try {
    this._channels[quid].close();
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Opens the gateway
 * @param {Function} callback - Optional completion callback
 */
TunnelGateway.prototype.open = function(callback) {
  var self = this;

  if (callback) {
    this.once('open', callback);
  }

  this._server.listen(0, function() {
    self._websock.on('connection', self._handleDataChannel.bind(self));
    self._onGatewayOpen();
  });
};

/**
 * Closes the gateway
 * @param {Function} callback - Optional completion callback
 */
TunnelGateway.prototype.close = function(callback) {
  var self = this;

  if (callback) {
    this.once('close', callback);
  }

  try {
    this._shutdown();
  } catch (err) {
    // noop
  }

  this._responses = {};
  this._channels = {};

  setImmediate(function() {
    self.emit('close');
  });
};

/**
 * Forces a gateway shutdown
 * @private
 */
TunnelGateway.prototype._shutdown = function() {
  this._websock.close();
  this._server.close();

  for (var id in this._responses) {
    this._responses[id].end();
  }

  for (var quid in this._channels) {
    this._channels[quid].close();
  }
};

/**
 * Handles incoming RPC messages
 * @private
 */
TunnelGateway.prototype._handleRPC = function(req, res) {
  var self = this;
  var message = new Buffer([]);

  req.on('data', function(chunk) {
    message = Buffer.concat([message, chunk]);
  });

  req.on('end', function() {
    try {
      message = kad.Message.fromBuffer(message);
    } catch (err) {
      res.writeHead(400);
      return res.end();
    }

    self._responses[message.id] = res; // Keep track of this response

    self.emit('message/rpc', message);
  });
};

/**
 * Handles incoming data channel connections
 * @private
 */
TunnelGateway.prototype._handleDataChannel = function(socket) {
  var self = this;
  var quid = crypto.randomBytes(6).toString('hex');

  this._channels[quid] = socket;

  socket.on('message', function(data, flags) {
    flags.quid = quid;

    self.emit('message/datachannel', data, flags);
  });

  socket.on('close', function() {
    delete self._channels[quid];
  });
};

/**
 * Fired when server begins listening
 * @private
 */
TunnelGateway.prototype._onGatewayOpen = function() {
  var self = this;

  setImmediate(function() {
    self.emit('open', self.getEntranceToken(), self.getEntranceAddress());
  });
};

module.exports = TunnelGateway;
