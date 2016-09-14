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
    self._clearTTWATimeout();
    self._handleClosed(function(err) {
      if (err) {
        return self.emit('error', err);
      }

      self.emit('finish');
    }, code, message);
  });

  FlushWritable.call(this);
}

WritableDataChannelStream.MAX_TTWA = 5000; // NB: Time To Write Acknowledgement

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

  function _flush(code, message) {
    self._clearTTWATimeout();
    self._handleClosed.call(
      self._channel._client,
      callback,
      code,
      message
    );
  }

  if (self._channel._client.readyState !== WebSocketClient.CLOSED) {
    self._channel._client.removeAllListeners('close');
    self._channel._client.on('close', _flush);
    self._createTTWATimeout();
  } else {
    callback(null);
  }
};

/**
 * Create a timeout for the remote host to acknowledge data was written
 * @private
 */
WritableDataChannelStream.prototype._createTTWATimeout = function() {
  var self = this;

  this._ttwaTimeout = setTimeout(function() {
    self.removeAllListeners('close');
    self.destroy();
    self.emit(
      'error',
      new Error('Did not close channel by max Time-To-Write-Acknowledgement')
    );
  }, WritableDataChannelStream.MAX_TTWA);
};

/**
 * Clears the timeout for TTWA
 * @private
 */
WritableDataChannelStream.prototype._clearTTWATimeout = function() {
  clearTimeout(this._ttwaTimeout);
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
 * @returns {Boolean} didDestroy - Indicates if the stream was destroyed
 */
WritableDataChannelStream.prototype.destroy = function() {
  if (this._isDestroyed) {
    return false;
  }

  this._channel._client.terminate();
  this._isDestroyed = true;

  return true;
};

module.exports = WritableDataChannelStream;
