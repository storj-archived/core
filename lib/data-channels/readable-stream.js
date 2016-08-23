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

  this.isAuthenticated = false;

  this._channel._client.on('message', this.push.bind(this));
  this._channel._client.on('close', function(code, message) {
    if (code !== 1000) {
      self.emit('error', new Error(message));
    }

    self.push(null);
  });

  ReadableStream.call(this);
}

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
    });
  }
};

/**
 * Closes the underlying connection
 */
ReadableDataChannelStream.prototype.destroy = function() {
  if (this._isDestroyed) {
    return false;
  }

  this._channel._client.terminate();
};

module.exports = ReadableDataChannelStream;
