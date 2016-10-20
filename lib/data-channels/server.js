'use strict';

var ws = require('ws');
var PassThrough = require('readable-stream').PassThrough;
var assert = require('assert');
var StorageManager = require('../storage/manager');
var events = require('events');
var inherits = require('util').inherits;
var crypto = require('crypto');
var utils = require('../utils');
var constants = require('../constants');
var DataChannelErrors = require('./error-codes');

/**
 * Creates a data channel server for sending and receiving consigned file shards
 * @constructor
 * @license AGPL-3.0
 * @param {Object} options
 * @param {http.Server} options.server - A http(s).Server instance
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {kad.Logger} options.logger - Logger to use from {@link Network}
 * @param {Number} [options.tokenTtl=86400000] - Close after idle
 */
function DataChannelServer(options) {
  if (!(this instanceof DataChannelServer)) {
    return new DataChannelServer(options);
  }

  this._checkOptions(options);
  events.EventEmitter.call(this);

  this._server = options.server;
  this._manager = options.storageManager;
  this._log = options.logger;
  this._ttl = options.tokenTtl || constants.TOKEN_EXPIRE;
  this._server = new ws.Server({ server: this._server });
  this._allowed = {};

  this._server.on('connection', this._handleConnection.bind(this));
  this._server.on('error', this._handleError.bind(this));
}

/**
 * Triggered when a shard has finished uploading to this instance
 * @event DataChannelServer#shardUploaded
 * @param {StorageItem} item - The item associated with the upload
 */

/**
 * Triggered when a shard has finished downloading from this instance
 * @event DataChannelServer#shardDownloaded
 * @param {StorageItem} item - The item associated with the download
 */

/**
 * Triggered when a connection is opened
 * @event DataChannelServer#connection
 * @param {WebSocket} socket - The socket connection opened
 */

/**
 * Triggered when a error occurs
 * @event DataChannelServer#error
 * @param {Error} error - The error object
 */

inherits(DataChannelServer, events.EventEmitter);

/**
 * Begin accepting data for the given file hash and token
 * @param {String} token - The authorization token created for transfer
 * @param {String} filehash - The shard hash to allow for the token
 * @param {Contact} contact - contact that negotiated the token
 */
DataChannelServer.prototype.accept = function(token, filehash, contact) {
  assert(typeof token === 'string', 'Invalid token supplied');
  assert(typeof filehash === 'string', 'Invalid filehash supplied');

  this._allowed[token] = {
    hash: filehash,
    client: null,
    contact: contact,
    expires: Date.now() + this._ttl
  };
};

/**
 * Stop accepting data for the given token
 * @param {String} token - The authorization token created for transfer
 */
DataChannelServer.prototype.reject = function(token) {
  assert(typeof token === 'string', 'Invalid token supplied');

  if (this._allowed[token] && this._allowed[token].client) {
    var client = this._allowed[token].client;

    if ([ws.CONNECTING, ws.OPEN].indexOf(client.readyState) !== -1) {
      this._allowed[token].client.close(
        DataChannelErrors.UNAUTHORIZED_TOKEN,
        'The authorization token was rejected'
      );
    }
  }

  delete this._allowed[token];
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
  assert(
    options.storageManager instanceof StorageManager,
    'Invalid manager supplied'
  );
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
    socket.close(DataChannelErrors.UNEXPECTED, err.message);
  });

  socket.on('message', function(data) {
    try {
      data = JSON.parse(data);
    } catch (err) {
      return socket.close(
        DataChannelErrors.INVALID_MESSAGE,
        'Failed to parse message'
      );
    }

    token = data.token;

    try {
      self._authorize(token, data.hash);
    } catch (err) {
      return socket.close(DataChannelErrors.UNAUTHORIZED_TOKEN, err.message);
    }

    self._allowed[token].client = socket;

    socket.removeAllListeners('message');

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
  assert(self._allowed[token].expires > Date.now(), 'Token has expired');
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
  var contact = this._allowed[token].contact;
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
      socket.close(DataChannelErrors.UNEXPECTED, err.message);
      return self.reject(token);
    }

    var contract = Object.keys(item.contracts)[0];
    var shardsize = item.contracts[contract].get('data_size');

    if (socket.readyState !== ws.OPEN) {
      return self.reject(token);
    }

    socket.resume();

    // If the shard is not writable, it means we already have it, so let's
    // just respond with a success message
    if (typeof item.shard.write !== 'function') {
      return self._closeSocketSuccess(socket, 'Consignment completed', token);
    }

    passthrough.on('data', function(chunk) {
      hasher.update(chunk);
      item.shard.write(chunk);

      if (received > shardsize) {
        socket.removeAllListeners('message');
        passthrough.removeAllListeners().end();
        item.shard.destroy(utils.noop);
        return socket.close(
          DataChannelErrors.FAILED_INTEGRITY,
          'The data transferred exceeds the amount defined in the contract'
        );
      }

      if (received === shardsize) {
        socket.removeAllListeners('message');
        passthrough.end();
      }
    }).resume();

    passthrough.on('end', function() {
      var calculatedHash = utils.rmd160(hasher.digest());

      if (calculatedHash !== hash) {
        self._log.warn('calculated hash does not match the expected result');
        item.shard.destroy(utils.noop);
        socket.close(
          DataChannelErrors.FAILED_INTEGRITY,
          'Calculated hash does not match the expected result'
        );
        return self.reject(token);
      }

      self._log.debug('Shard upload completed');
      item.shard.end();
      self._closeSocketSuccess(socket, 'Consignment completed', token);
      self.emit('shardUploaded', item, contact);
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
  var contact = this._allowed[token].contact;

  this._manager.load(hash, function(err, item) {
    if (err) {
      socket.close(DataChannelErrors.UNEXPECTED, err.message);
      return self.reject(token);
    }

    var filestream = item.shard;

    filestream.on('data', function(data) {
      filestream.pause();

      if (socket.readyState !== ws.OPEN) {
        filestream.removeAllListeners();
        return self.reject(token);
      }

      socket.send(data, { binary: true }, function() {
        filestream.resume();
      });
    });

    filestream.on('end', function() {
      self._closeSocketSuccess(socket, 'File transfer complete', token);
      self.emit('shardDownloaded', item, contact);
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

  client.close(
    DataChannelErrors.INVALID_OPERATION,
    'Failed to handle the defined operation'
  );
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

/**
 * Sends a success message for operation and rejects the token
 * @private
 */
DataChannelServer.prototype._closeSocketSuccess = function(sock, msg, token) {
  sock.close(1000, msg);
  this.reject(token);
};

module.exports = DataChannelServer;
