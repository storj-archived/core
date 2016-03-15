'use strict';

var BinaryServer = require('binaryjs').BinaryServer;
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

  assert.ok(options, 'No options were supplied to constructor');
  assert(options.transport instanceof Transport, 'Invalid transport adapter');
  assert(options.manager instanceof Manager, 'Invalid manager supplied');
  assert.ok(options.logger, 'Invalid logger supplied');

  events.EventEmitter.call(this);

  this._transport = options.transport;
  this._manager = options.manager;
  this._log = options.logger;
  this._ttl = options.ttl || ms('2m');
  this._server = new BinaryServer({ server: this._transport._server });
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
 * Handles incoming connections
 * @private
 * @param {BinaryClient} client - The connected client object
 */
DataChannelServer.prototype._handleConnection = function(client) {
  var self = this;

  this._log.info('data channel connection opened');
  this.emit('connection', client);

  client.on('error', function(err) {
    self._log.error('data channel connection error: %s', err.message);
    client.close();
  });

  client.on('stream', function(stream, meta) {
    self._log.info('receiving stream from client');

    var token = meta.token;
    var hash = meta.hash;
    var operation = meta.operation;

    try {
      assert.ok(token, 'You did not supply a token');
      assert.ok(self._allowed[token], 'The supplied token is not accepted');
      assert.ok(hash, 'You did not supply the data hash');
      assert(self._allowed[token].client === null, 'Channel is already active');
      assert(self._allowed[token].hash === hash, 'Token not valid for hash');
    } catch (err) {
      stream.write({ message: err.message, error: true });
      return client.close();
    }

    self._allowed[token].client = client;

    switch (operation) {
      case 'PUSH':
        return self._handleConsignStream(stream, token);
      case 'PULL':
        return self._handleRetrieveStream(stream, token);
      default:
        return self._handleUnknownStream(stream, token);
    }
  });
};

/**
 * Receives the data stream and writes it to storage
 * @private
 * @param {stream.Readable} stream - The incoming data stream
 * @param {String} token - The valid channel token
 */
DataChannelServer.prototype._handleConsignStream = function(stream, token) {
  var self = this;
  var hasher = crypto.createHash('sha256');
  var hash = this._allowed[token].hash;
  var passthrough = new PassThrough();

  stream.pipe(passthrough).pause();

  this._manager.load(hash, function(err, item) {
    if (err) {
      stream.write({ error: true, message: err.message });
      return self.reject(token);
    }

    // If the shard is not writable, it means we already have it, so let's
    // just respond with a success message
    if (typeof item.shard.write !== 'function') {
      stream.write({
        error: false,
        message: 'Consignment completed successfully'
      });
      return self.reject(token);
    }

    passthrough.on('data', function(chunk) {
      hasher.update(chunk);
      item.shard.write(chunk);
    }).resume();

    passthrough.on('end', function() {
      if (utils.rmd160(hasher.digest('hex')) !== hash) {
        stream.write({
          error: true,
          message: 'Calculated hash does not match the expected result'
        });
        return self.reject(token);
      }

      item.shard.end();
      stream.write({
        error: false,
        message: 'Consignment completed successfully'
      });

      self.reject(token);
    });
  });
};

/**
 * Pumps the data through to the client
 * @private
 * @param {stream.Readable} stream - The incoming data stream
 * @param {String} token - The valid channel token
 */
DataChannelServer.prototype._handleRetrieveStream = function(stream, token) {
  var self = this;
  var hash = this._allowed[token].hash;

  this._manager.load(hash, function(err, item) {
    if (err) {
      stream.write({ error: true, message: err.message });
      return self.reject(token);
    }

    var filestream = item.shard.pipe(stream);

    filestream.on('end', function() {
      stream.end();
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
    error: true,
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
