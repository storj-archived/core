'use strict';

module.exports = function(crypto) {

var constants = require('../constants');
var inherits = require('util').inherits;
var assert = require('assert');
var DataCipherKeyIv = require('../cipherkeyiv');

/**
 * Represents a duplex stream capable of taking encrypted data as input and
 * producing output decrypted by a {@link DataCipherKeyIv}
 * @constructor
 * @param {DataCipherKeyIv} keyiv - Object to use for derivation function
 * @emits DecryptStream#data
 * @emits DecryptStream#end
 */
function DecryptStream(keyiv) {
  if (!(this instanceof DecryptStream)) {
    return new DecryptStream(keyiv);
  }

  assert(keyiv instanceof DataCipherKeyIv, 'Invalid cipher object supplied');

  this.keyiv = keyiv;

  crypto.Decipheriv.apply(this, [constants.CIPHER_ALG].concat(
    keyiv.getCipherKeyIv()
  ));
}

/**
 * Triggered when some input bytes have become decrypted output bytes
 * @event DecryptStream#data
 * @type {Buffer}
 */

/**
 * Triggered when the stream has ended
 * @event DecryptStream#end
 */

inherits(DecryptStream, crypto.Decipheriv);
  
return DecryptStream;
};
