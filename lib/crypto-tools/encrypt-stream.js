'use strict';

var constants = require('../constants');
var assert = require('assert');
var crypto = require('crypto');
var stream = require('readable-stream');
var inherits = require('util').inherits;
var DataCipherKeyIv = require('../crypto-tools/cipher-key-iv');
var DeterministicKeyIv = require('../crypto-tools/deterministic-key-iv');

/**
 * Represents a duplex stream capable of taking cleartext data as input and
 * producing output encrypted with {@link DataCipherKeyIv}
 * @constructor
 * @license LGPL-3.0
 * @param {DataCipherKeyIv|DeterministicKeyIv} keyiv - Object to use
 * for derivation function
 * @emits EncryptStream#data
 * @emits EncryptStream#end
 */
function EncryptStream(keyiv) {
  if (!(this instanceof EncryptStream)) {
    return new EncryptStream(keyiv);
  }

  assert(
    keyiv instanceof DataCipherKeyIv || keyiv instanceof DeterministicKeyIv,
    'Invalid cipher object supplied'
  );

  this._cipher = crypto.createCipheriv.apply(
    this,
    [constants.CIPHER_ALG].concat(keyiv.getCipherKeyIv())
  );

  stream.Transform.call(this);
}

inherits(EncryptStream, stream.Transform);

/**
 * Writes to the internal cipheriv
 * @private
 */
EncryptStream.prototype._transform = function(chunk, enc, callback) {
  this._cipher.write(chunk);
  callback(null, this._cipher.read());
};

/**
 * Ensures that there is no remaining bytes to be read from cipher
 * @private
 */
EncryptStream.prototype._flush = function(callback) {
  callback(null, this._cipher.read());
};

/**
 * Triggered when some input bytes have become encrypted output bytes
 * @event EncryptStream#data
 * @type {Buffer}
 */

/**
 * Triggered when the stream has ended
 * @event EncryptStream#end
 */

module.exports = EncryptStream;
