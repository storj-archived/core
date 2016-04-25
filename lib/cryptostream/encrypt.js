'use strict';

var utils = require('../utils');
var constants = require('../constants');
var inherits = require('util').inherits;
var assert = require('assert');
var crypto = require('crypto');
var KeyPair = require('../keypair');

/**
 * Represents a duplex stream capable of taking cleartext data as input and
 * producing output encrypted with the private portion of a {@link KeyPair}
 * @constructor
 * @param {KeyPair} keypair - Keypair object to use for derivation function
 */
function EncryptStream(keypair) {
  if (!(this instanceof EncryptStream)) {
    return new EncryptStream(keypair);
  }

  assert(keypair instanceof KeyPair, 'Invalid keypair object supplied');

  this.keypair = keypair;

  crypto.Cipheriv.apply(this, [constants.CIPHER_ALG].concat(
    utils.createCipherKeyAndIv(this.keypair)
  ));
}

inherits(EncryptStream, crypto.Cipheriv);

module.exports = EncryptStream;
