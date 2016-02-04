'use strict';

var bitcore = require('bitcore-lib');

/**
 * Represents a ECDSA key pair
 * @constructor
 * @param {String|Buffer} privkey - WIF encoded ECDSA private key
 */
function KeyPair(privkey) {
  if (!(this instanceof KeyPair)) {
    return new KeyPair(privkey);
  }

  if (privkey) {
    this._privkey = bitcore.PrivateKey.fromString(privkey);
  } else {
    this._privkey = bitcore.PrivateKey.fromRandom();
  }

  this._pubkey = this._privkey.toPublicKey();
}

/**
 * Returns the private key
 * @returns {Buffer}
 */
KeyPair.prototype.getPrivateKey = function() {
  return this._privkey.toString();
};

/**
 * Returns the public key
 * @returns {Buffer}
 */
KeyPair.prototype.getPublicKey = function() {
  return this._pubkey.toString();
};

/**
 * Returns the NodeID derived from the public key
 * @returns {String} nodeID - RIPEMD160 hash of public key
 */
KeyPair.prototype.getNodeID = function() {
  return bitcore.crypto.Hash.sha256ripemd160(
    this._pubkey.toBuffer()
  ).toString('hex');
};

/**
 * Returns the bitcoin address version of the nodeID
 * @returns {String} address - Base58 encoded address
 */
KeyPair.prototype.getAddress = function() {
  return bitcore.Address.fromPublicKeyHash(
    new Buffer(this.getNodeID(), 'hex')
  ).toString();
};

module.exports = KeyPair;
