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
  var firstNullByte = chunk.indexOf(0);
  var lastNullByte = chunk.lastIndexOf(0);
  var lastByteIsNull = lastNullByte === chunk.length - 1;
  var expectedPadding = Buffer(lastNullByte - firstNullByte).fill(0);
  var possiblePadding = chunk.slice(firstNullByte, lastNullByte);
  var sectionIsNull = Buffer.compare(expectedPadding, possiblePadding) === 0;
  var isPadding = sectionIsNull && lastByteIsNull;

  if (isPadding) {
    callback(null, chunk.slice(0, firstNullByte));
  } else {
    callback(null, chunk);
  }
};

module.exports = Unpadder;
