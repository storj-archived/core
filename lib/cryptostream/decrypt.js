'use strict';

var utils = require('../utils');
var constants = require('../constants');
var inherits = require('util').inherits;
var assert = require('assert');
var crypto = require('crypto');
var KeyPair = require('../keypair');

/**
 * Represents a duplex stream capable of taking encrypted data as input and
 * producing output decrypted by the private portion of a {@link KeyPair}
 * @constructor
 * @param {KeyPair} keypair - Keypair object to use for derivation function
 */
function DecryptStream(keypair) {
  if (!(this instanceof DecryptStream)) {
    return new DecryptStream(keypair);
  }

  assert(keypair instanceof KeyPair, 'Invalid keypair object supplied');

  this.keypair = keypair;

  crypto.Decipheriv.apply(this, [constants.CIPHER_ALG].concat(
    utils.createCipherKeyAndIv(this.keypair)
  ));
}

inherits(DecryptStream, crypto.Decipheriv);

module.exports = DecryptStream;
