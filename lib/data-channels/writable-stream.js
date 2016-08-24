'use strict';

var WebSocketClient = require('ws');
var FlushWritable = require('flushwritable');
var inherits = require('util').inherits;

/**
 * A writable stream for transferring data via {@link DataChannelClient}
 * @constructor
 * @param {DataChannelClient} channel - The data channel client to use
 * @param {String} token - The authorization token for transfer
 * @param {String} hash - The hash of the data to transfer
 */
function WritableDataChannelStream(channel, token, hash) {
  if (!(this instanceof WritableDataChannelStream)) {
    return new WritableDataChannelStream(channel, token, hash);
  }

  var self = this;

  this._channel = channel;
  this._token = token;
  this._hash = hash;
  this._isDestroyed = false;

  this.isAuthenticated = false;

  this._channel._client.on('close', function(code, message) {
    self._handleClosed(function(err) {
      if (err) {
        return self.emit('error', err);
      }

      self.emit('finish');
    }, code, message);
  });

  FlushWritable.call(this);
}

/**
 * Triggered when a error occurs
 * @event WritableDataChannelStream#error
 * @param {Error} error - The error object
 */

/**
 * Triggered when all data has been flushed and remote host receives it
 * @event WritableDataChannelStream#finish
 */

inherits(WritableDataChannelStream, FlushWritable);

/**
 * Implements the underlying writer
 * @private
 */
WritableDataChannelStream.prototype._write = function(chunk, enc, callback) {
  var self = this;

  if (!this.isAuthenticated) {
    return self._channel._client.send(JSON.stringify({
      token: self._token,
      hash: self._hash,
      operation: 'PUSH'
    }), function() {
      self.isAuthenticated = true;
      self._sendData(chunk, callback);
    });
  }

  self._sendData(chunk, callback);
};

/**
 * Implements the underyling flusher (only emit finish after data is received)
 * @private
 */
WritableDataChannelStream.prototype._flush = function(callback) {
  var self = this;

  if (self._channel._client.readyState !== WebSocketClient.CLOSED) {
    self._channel._client.removeAllListeners('close');
    self._channel._client.on('close', self._handleClosed.bind(
      self._channel._client,
      callback
    ));
  } else {
    callback(null);
  }
};

/**
 * Send the data to the remote host
 * @private
 */
WritableDataChannelStream.prototype._sendData = function(chunk, next) {
  var self = this;

  if (WebSocketClient.OPEN !== self._channel._client.readyState) {
    return self.emit('error', new Error('Remote host terminated early'));
  }

  self._channel._client.send(chunk, { binary: true }, next);
};

/**
 * If the remote host terminates before we call _flush, handle it
 * @private
 */
WritableDataChannelStream.prototype._handleClosed = function(flush, code, msg) {
  if (code !== 1000) {
    var err = new Error(msg || 'Unspecified error occurred'); err.code = code;

    return flush(err);
  }

  flush(null);
};

/**
 * Closes the underlying connection
 */
WritableDataChannelStream.prototype.destroy = function() {
  if (this._isDestroyed) {
    return false;
  }

  this._channel._client.terminate();
};

module.exports = WritableDataChannelStream;
