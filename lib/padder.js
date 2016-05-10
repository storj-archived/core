'use strict';

var stream = require('readable-stream');
var inherits = require('util').inherits;

/**
 * Takes an input stream and pads the tail with zeroes to the next byte mulitple
 * @constructor
 */
function Padder() {
  if (!(this instanceof Padder)) {
    return new Padder();
  }

  this._bytesRead = 0;

  stream.Transform.call(this);
}

inherits(Padder, stream.Transform);

Padder.DEFAULTS = {
  multiple: 1024 * 1024 * 8
};

/**
 * Implements a simple passthrough while tracking number of bytes
 * @private
 */
Padder.prototype._transform = function(chunk, enc, callback) {
  this._bytesRead += chunk.length;

  this.push(chunk);
  callback(null);
};

/**
 * Pads the tail of the stream with zeroes
 * @private
 */
Padder.prototype._flush = function(callback) {
  var remainder = this._bytesRead - Padder.DEFAULTS.multiple;

  if (this._bytesRead < Padder.DEFAULTS.multiple) {
    this.push(Buffer(Padder.DEFAULTS.multiple - this._bytesRead).fill(0));
    return callback(null);
  }

  if (remainder) {
    this.push(Buffer(Padder.DEFAULTS.multiple - remainder).fill(0));
    return callback(null);
  }
};

module.exports = Padder;
