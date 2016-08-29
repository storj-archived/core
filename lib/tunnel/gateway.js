'use strict';

var kad = require('kad');
var http = require('http');
var https = require('https');
var ws = require('ws');
var events = require('events');
var inherits = require('util').inherits;
var crypto = require('crypto');
var merge = require('merge');

/**
 * Creates a tunnel gateway and emits manages entry and exit messages
 * @constructor
 * @license AGPL-3.0
 * @param {Object} options - Options to pass to http.Server/https.Server
 * @param {Object} [options.logger] - A logger to use
 * @param {Number} port - Port to bind gateway entrance
 * @fires TunnelGateway#message/rpc
 * @fires TunnelGateway#message/datachannel
 */
function TunnelGateway(options, port) {
  if (!(this instanceof TunnelGateway)) {
    return new TunnelGateway(options, port);
  }

  this._port = port || 0;
  this._options = merge(Object.create(TunnelGateway.DEFAULTS), options);
  this._server = this._options.cert && this._options.key ?
                 https.createServer(this._options, this._handleRPC.bind(this)) :
                 http.createServer(this._handleRPC.bind(this));
  this._websock = new ws.Server({ server: this._server });
  this._logger = this._options.logger;

  // Manages pending RPC responses
  this._responses = {};

  // Manages open data channel sockets
  this._channels = {};

  this.token = crypto.randomBytes(32).toString('hex');
}

TunnelGateway.DEFAULTS = {
  logger: kad.Logger(0)
};

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
    this._logger.debug('responding for tunneled client for %s', message.id);
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

  if (!flags.binary) {
    var terminationInfo = this._checkForTerminationSignal(data);

    if (terminationInfo.isTerminationSignal) {
      this._logger.debug(
        'sending tunneled datachannel termination signal (%s)',
        quid
      );
      return this.terminate(
        quid,
        terminationInfo.parsedSignal.code,
        terminationInfo.parsedSignal.message
      );
    }
  }

  try {
    this._logger.debug('sending tunneled datachannel content (%s)', quid);
    this._channels[quid].send(data, flags);
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Checks if a datachannel message is a termination signal
 * @private
 */
TunnelGateway.prototype._checkForTerminationSignal = function(data) {
  var result = {
    isTerminationSignal: false,
    parsedSignal: null
  };

  try {
    result.parsedSignal = JSON.parse(data);
  } catch (err) {
    return result;
  }

  result.isTerminationSignal = !!(result.parsedSignal.code &&
                                  result.parsedSignal.message);

  return result;
};

/**
 * Terminates the specified channel
 * @param {String} quid - The quasi-unique socket identifier
 * @param {Number} code - The status code
 * @param {String} [message] - Status message
 * @returns {Boolean} terminated - Whether or not the channel was terminated
 */
TunnelGateway.prototype.terminate = function(quid, code, message) {
  if (!this._channels[quid]) {
    return false;
  }

  try {
    this._channels[quid].close(code, message);
  } catch (err) {
    return false;
  }

  this._logger.debug('tunneled datachannel terminated (%s)', quid);
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
    this.once('error', callback);
  }

  this._websock.on('error', this._handleError.bind(this));

  this._server.on('listening', function() {
    self._logger.info('tunnel gateway opened on port %s', self._port);
    self._websock.on('connection', self._handleDataChannel.bind(self));
    self._onGatewayOpen();
  });

  this._server.listen(this._port);
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
    self._logger.info('tunnel gateway on port %s closed', self._port);
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

  req.on('error', function(err) {
    self._logger.error(
      'problem receiving rpc message on tunnel gateway: %s',
      err.message
    );
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

  socket.on('error', function(err) {
    self._logger.error(
      'problem receiving datachannel on tunnel gateway: %s',
      err.message
    );
  });
};

/**
 * Bubbles error events
 * @private
 */
TunnelGateway.prototype._handleError = function() {
  this.emit('error', new Error('Failed to open tunnel gateway'));
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
