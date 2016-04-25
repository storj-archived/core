'use strict';

var assert = require('assert');
var stream = require('readable-stream');
var inherits = require('util').inherits;

/**
 * Accepts multiple ordered input sources and exposes them as a single
 * contiguous readable stream. Used for re-assembly of shards.
 * @constructor
 * @param {Object} options
 * @param {Number} options.shards - Number of total shards to be multiplexed
 * @param {Number} options.length - Number of total bytes of input
 * @fires FileMuxer#drain
 */
function FileMuxer(options) {
  if (!(this instanceof FileMuxer)) {
    return new FileMuxer(options);
  }

  this._checkOptions(options);

  this._shards = options.shards;
  this._length = options.length;
  this._inputs = [];
  this._bytesRead = 0;
  this._added = 0;

  stream.Readable.call(this);
}

/**
 * Triggered when the muxer has drained one of the supplied inputs
 * @event FileMuxer#drain
 * @param {ReadableStream} input - The drained input stream
 */

inherits(FileMuxer, stream.Readable);

/**
 * Checks the options supplied to the constructor
 * @private
 */
FileMuxer.prototype._checkOptions = function(options) {
  var shards = options.shards;
  var length = options.length;

  assert(typeof shards === 'number', 'You must supply a shards parameter');
  assert(shards > 0, 'Cannot multiplex a 0 shard stream');
  assert(typeof length === 'number', 'You must supply a length parameter');
  assert(length > 0, 'Cannot multiplex a 0 length stream');
};

/**
 * Implements the underlying read method
 * @private
 */
FileMuxer.prototype._read = function() {
  var self = this;

  if (this._bytesRead === this._length) {
    return this.push(null);
  }

  if (!this._inputs[0]) {
    return this.emit('error', new Error('Unexpected end of input'));
  }

  var bytes = this._inputs[0].read();

  if (bytes === null && this._bytesRead < this._length) {
    return setImmediate(function() {
      self._read();
    });
  }

  if (this._length < this._bytesRead + bytes.length) {
    return this.emit('error', new Error('Input exceeds the declared length'));
  }

  this._bytesRead += bytes.length;

  this.push(bytes);
};

/**
 * Adds an additional input stream to the multiplexer
 * @param {ReadableStream} readable - Readable input stream from file shard
 */
FileMuxer.prototype.input = function(readable) {
  assert(typeof readable.pipe === 'function', 'Invalid input stream supplied');
  assert(this._added < this._shards, 'Inputs exceed defined number of shards');

  var self = this;
  var input = readable.pipe(stream.PassThrough()).pause();

  input.on('end', function() {
    self._inputs.splice(self._inputs.indexOf(input), 1);
    self.emit('drain', input);
  });

  this._added++;
  this._inputs.push(input);

  return this;
};

module.exports = FileMuxer;
