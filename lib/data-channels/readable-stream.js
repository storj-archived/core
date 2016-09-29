'use strict';

var inherits = require('util').inherits;
var ReadableStream = require('readable-stream');

/**
 * A readable stream for transferring data via {@link DataChannelClient}
 * @constructor
 * @param {DataChannelClient} channel - The data channel client to use
 * @param {String} token - The authorization token for transfer
 * @param {String} hash - The hash of the data to transfer
 */
function ReadableDataChannelStream(channel, token, hash) {
  if (!(this instanceof ReadableDataChannelStream)) {
    return new ReadableDataChannelStream(channel, token, hash);
  }

  var self = this;

  this._channel = channel;
  this._token = token;
  this._hash = hash;
  this._isDestroyed = false;

  this.isAuthenticated = false;

  this._channel._client.on('message', this._push.bind(this));
  this._channel._client.on('close', function(code, message) {
    if (code !== 1000) {
      self.emit('error', new Error(message));
    }

    self.push(null);
  });

  ReadableStream.call(this);
}

ReadableDataChannelStream.MAX_TTFB = 30000; // NB: Time To First Byte

/**
 * Triggered when a error occurs
 * @event ReadableDataChannelStream#error
 * @param {Error} error - The error object
 */

/**
 * Triggered when a chunk of data has been received from the remote host
 * @event ReadableDataChannelStream#data
 */

/**
 * Triggered when all data has been received from the remote host
 * @event ReadableDataChannelStream#end
 */

inherits(ReadableDataChannelStream, ReadableStream);

/**
 * Implements the underlying writer
 * @private
 */
ReadableDataChannelStream.prototype._read = function() {
  var self = this;

  if (!self.isAuthenticated) {
    return self._channel._client.send(JSON.stringify({
      token: self._token,
      hash: self._hash,
      operation: 'PULL'
    }), function() {
      self.isAuthenticated = true;
      self._createTTFBTimeout();
    });
  }
};

/**
 * Proxies the underlying push method to clear TTFB timer
 * @private
 */
ReadableDataChannelStream.prototype._push = function(bytes) {
  this._clearTTFBTimeout();
  this.push(bytes);
};

/**
 * Creates a timeout for receiving the first bytes
 * @private
 */
ReadableDataChannelStream.prototype._createTTFBTimeout = function() {
  var self = this;

  this._ttfbTimeout = setTimeout(function() {
    self.emit(
      'error',
      new Error('Did not receive data within max Time-To-First-Byte')
    );
    self.destroy();
  }, ReadableDataChannelStream.MAX_TTFB);
};

/**
 * Destroys the timeout for receiving first bytes
 * @private
 */
ReadableDataChannelStream.prototype._clearTTFBTimeout = function() {
  clearTimeout(this._ttfbTimeout);
};

/**
 * Closes the underlying connection
 * @returns {Boolean} didDestroy - Indicates if the stream was destroyed
 */
ReadableDataChannelStream.prototype.destroy = function() {
  this._clearTTFBTimeout();

  if (this._isDestroyed) {
    return false;
  }

  this._channel._client.terminate();
  this._isDestroyed = true;

  return true;
};

module.exports = ReadableDataChannelStream;
