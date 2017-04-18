'use strict';

var constants = require('../constants');
var inherits = require('util').inherits;
var assert = require('assert');
var crypto = require('crypto');
var stream = require('readable-stream');
var DataCipherKeyIv = require('../crypto-tools/cipher-key-iv');
var DeterministicKeyIv = require('../crypto-tools/deterministic-key-iv');

/**
 * Represents a duplex stream capable of taking encrypted data as input and
 * producing output decrypted by a {@link DataCipherKeyIv}
 * @constructor
 * @license LGPL-3.0
 * @param {DataCipherKeyIv|DeterministicKeyIv} keyiv - Object to use
 * for derivation function
 * @emits DecryptStream#data
 * @emits DecryptStream#end
 */
function DecryptStream(keyiv) {
  if (!(this instanceof DecryptStream)) {
    return new DecryptStream(keyiv);
  }

  assert(
    keyiv instanceof DataCipherKeyIv || keyiv instanceof DeterministicKeyIv,
    'Invalid cipher object supplied'
  );

  this._decipher = crypto.createDecipheriv.apply(
    this,
    [constants.CIPHER_ALG].concat(keyiv.getCipherKeyIv())
  );

  stream.Transform.call(this);
}

inherits(DecryptStream, stream.Transform);

/**
 * Writes to the underlying decipher
 * @private
 */
DecryptStream.prototype._transform = function(chunk, enc, callback) {
  this._decipher.write(chunk);
  callback(null, this._decipher.read());
};

/**
 * Ensures there is no more data to be read from decipher
 * @private
 */
DecryptStream.prototype._flush = function(callback) {
  callback(null, this._decipher.read());
};

/**
 * Triggered when some input bytes have become decrypted output bytes
 * @event DecryptStream#data
 * @type {Buffer}
 */

/**
 * Triggered when the stream has ended
 * @event DecryptStream#end
 */

module.exports = DecryptStream;
