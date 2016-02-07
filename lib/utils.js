'use strict';

var crypto = require('crypto');

/**
 * Returns the SHA-256 hash of the input
 * @param {Buffer}
 * @returns {Buffer}
 */
module.exports.sha256 = function(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
};

module.exports.getNextPowerOfTwo = function(num) {
  return Math.pow(2, Math.ceil(Math.log(num) / Math.log(2)));
};
