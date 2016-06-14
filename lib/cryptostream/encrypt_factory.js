'use strict';

module.exports = function(crypto) {

var constants = require('../constants');
var inherits = require('util').inherits;
var assert = require('assert');
var DataCipherKeyIv = require('../cipherkeyiv');

/**
 * Represents a duplex stream capable of taking cleartext data as input and
 * producing output encrypted with {@link DataCipherKeyIv}
 * @constructor
 * @param {DataCipherKeyIv} keyiv - Object to use for derivation function
 * @emits EncryptStream#data
 * @emits EncryptStream#end
 */
function EncryptStream(keyiv) {
  if (!(this instanceof EncryptStream)) {
    return new EncryptStream(keyiv);
  }

  assert(keyiv instanceof DataCipherKeyIv, 'Invalid cipher object supplied');

  this.keyiv = keyiv;

  crypto.Cipheriv.apply(this, [constants.CIPHER_ALG].concat(
    keyiv.getCipherKeyIv()
  ));
}

/**
 * Triggered when some input bytes have become encrypted output bytes
 * @event EncryptStream#data
 * @type {Buffer}
 */

/**
 * Triggered when the stream has ended
 * @event EncryptStream#end
 */

inherits(EncryptStream, crypto.Cipheriv);

return EncryptStream;
};
