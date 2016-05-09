'use strict';

var stream = require('readable-stream');
var inherits = require('util').inherits;

/**
 * Takes an input stream and removes padded zeroes from the tail
 * @constructor
 */
function Unpadder() {
  if (!(this instanceof Unpadder)) {
    return new Unpadder();
  }

  stream.Transform.call(this);
}

inherits(Unpadder, stream.Transform);

/**
 * Implements the transformer
 * @private
 */
Unpadder.prototype._transform = function(chunk, enc, callback) {
  callback(null, chunk); // TODO: IMPLEMENT ME
};

module.exports = Unpadder;
