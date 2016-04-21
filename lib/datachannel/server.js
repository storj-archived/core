'use strict';

var ws = require('ws');
var PassThrough = require('stream').PassThrough;
var assert = require('assert');
var Transport = require('../network/transport');
var Manager = require('../manager');
var events = require('events');
var inherits = require('util').inherits;
var ms = require('ms');
var crypto = require('crypto');
var utils = require('../utils');

/**
 * Creates a data channel server for sending and receiving consigned file shards
 * @constructor
 * @param {Object} options
 * @param {Transport} options.transport - Transport adapter from {@link Network}
 * @param {Manager} options.manager - The Manager from {@link Network}
 * @param {kad.Logger} options.logger - Logger to use from {@link Network}
 * @param {Number} options.ttl - Close after idle for this length of time
 */
function DataChannelServer(options) {
  if (!(this instanceof DataChannelServer)) {
    return new DataChannelServer(options);
  }

  this._checkOptions(options);
  events.EventEmitter.call(this);

  this._transport = options.transport;
  this._manager = options.manager;
  this._log = options.logger;
  this._ttl = options.ttl || ms('2m');
  this._server = new ws.Server({ server: this._transport._server });
  this._allowed = {};

  this._server.on('connection', this._handleConnection.bind(this));
  this._server.on('error', this._handleError.bind(this));
}

inherits(DataChannelServer, events.EventEmitter);

/**
 * Begin accepting data for the given file hash and token
 * @param {String} token - The authorization token created for transfer
 * @param {String} filehash - The shard hash to allow for the token
 */
DataChannelServer.prototype.accept = function(token, filehash) {
  assert(typeof token === 'string', 'Invalid token supplied');
  assert(typeof filehash === 'string', 'Invalid filehash supplied');

  this._allowed[token] = { hash: filehash, client: null };
};

/**
 * Stop accepting data for the given token
 * @param {String} token - The authorization token created for transfer
 */
DataChannelServer.prototype.reject = function(token) {
  assert(typeof token === 'string', 'Invalid token supplied');

  if (this._allowed[token]) {
    if (this._allowed[token].client) {
      this._allowed[token].client.close();
    }

    delete this._allowed[token];
  }
};

/**
 * Closes the data channel and disconnects all clients
 */
DataChannelServer.prototype.close = function() {
  return this._server.close();
};

/**
 * Checks the options supplied to constructor
 * @private
 */
DataChannelServer.prototype._checkOptions = function(options) {
  assert.ok(options, 'No options were supplied to constructor');
  assert(options.transport instanceof Transport, 'Invalid transport adapter');
  assert(options.manager instanceof Manager, 'Invalid manager supplied');
  assert.ok(options.logger, 'Invalid logger supplied');
};

/**
 * Handles incoming connections
 * @private
 * @param {Socket} socket - The connected socket object
 */
DataChannelServer.prototype._handleConnection = function(socket) {
  var self = this;
  var token = null;

  this._log.info('data channel connection opened');
  this.emit('connection', socket);

  socket.on('error', function(err) {
    self._log.error('data channel connection error: %s', err.message);
    socket.send(JSON.stringify({ code: 500, message: err.message }));
  });

  socket.on('message', function(data) {
    if (self._allowed[token] && self._allowed[token].client !== null) {
      return;
    }

    try {
      data = JSON.parse(data);
    } catch (err) {
      return socket.send(JSON.stringify({
        code: 400,
        message: 'Failed to parse message'
      })).terminate();
    }

    token = data.token;

    try {
      self._authorize(token, data.hash);
    } catch (err) {
      return socket.send(JSON.stringify({
        code: 400, message: err.message
      })).terminate();
    }

    self._allowed[token].client = socket;

    switch (data.operation) {
      case 'PUSH':
        return self._handleConsignStream(socket, token);
      case 'PULL':
        return self._handleRetrieveStream(socket, token);
      default:
        return self._handleUnknownStream(socket, token);
    }
  });
};

/**
 * Validates the given token
 * @private
 */
DataChannelServer.prototype._authorize = function(token, hash) {
  var self = this;

  assert.ok(token, 'You did not supply a token');
  assert.ok(self._allowed[token], 'The supplied token is not accepted');
  assert.ok(hash, 'You did not supply the data hash');
  assert(self._allowed[token].client === null, 'Channel is already active');
  assert(self._allowed[token].hash === hash, 'Token not valid for hash');
};

/**
 * Receives the data stream and writes it to storage
 * @private
 * @param {stream.Readable} socket - The connected socket
 * @param {String} token - The valid channel token
 */
DataChannelServer.prototype._handleConsignStream = function(socket, token) {
  var self = this;
  var hasher = crypto.createHash('sha256');
  var hash = this._allowed[token].hash;
  var passthrough = new PassThrough();
  var received = 0;

  passthrough.pause();

  socket.on('message', function(data) {
    received += data.length;
    passthrough.write(data);
  });

  this._manager.load(hash, function(err, item) {
    if (err) {
      socket.send(JSON.stringify({ code: 500, message: err.message }));
      return self.reject(token);
    }

    var contract = Object.keys(item.contracts)[0];
    var shardsize = item.contracts[contract].get('data_size');

    socket.resume();

    // If the shard is not writable, it means we already have it, so let's
    // just respond with a success message
    if (typeof item.shard.write !== 'function') {
      socket.send(JSON.stringify({
        code: 200,
        message: 'Consignment completed successfully'
      }));
      return self.reject(token);
    }

    passthrough.on('data', function(chunk) {
      hasher.update(chunk);
      item.shard.write(chunk);

      if (received >= shardsize) {
        passthrough.end();
      }
    }).resume();

    passthrough.on('end', function() {
      if (utils.rmd160(hasher.digest('hex')) !== hash) {
        socket.send(JSON.stringify({
          code: 400,
          message: 'Calculated hash does not match the expected result'
        }));
        return self.reject(token);
      }

      item.shard.end();
      socket.send(JSON.stringify({
        code: 200,
        message: 'Consignment completed successfully'
      }));

      self.reject(token);
    });
  });
};

/**
 * Pumps the data through to the client
 * @private
 * @param {stream.Readable} socket - The incoming data stream
 * @param {String} token - The valid channel token
 */
DataChannelServer.prototype._handleRetrieveStream = function(socket, token) {
  var self = this;
  var hash = this._allowed[token].hash;

  this._manager.load(hash, function(err, item) {
    if (err) {
      socket.send(JSON.stringify({ code: 500, message: err.message }));
      return self.reject(token);
    }

    var filestream = item.shard;

    filestream.on('data', function(data) {
      filestream.pause();
      socket.send(data, { binary: true }, function() {
        filestream.resume();
      });
    });

    filestream.on('end', function() {
      self.reject(token);
    });
  });
};

/**
 * Closes the stream if it cannot be handled
 * @private
 * @param {stream.Readable} stream - The incoming data stream
 * @param {String} token - The valid channel token
 */
DataChannelServer.prototype._handleUnknownStream = function(stream, token) {
  var client = this._allowed[token].client;

  client.send({
    code: 400,
    message: 'Failed to handle the defined operation'
  });

  this.reject(token);
};

/**
 * Handles binary server errors
 * @private
 * @param {Error} err - The error object
 */
DataChannelServer.prototype._handleError = function(err) {
  this._log.error('data channel server encountered an error: %s', err.message);
  this.emit('error', err);
};

module.exports = DataChannelServer;
