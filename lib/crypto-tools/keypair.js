'use strict';

var bitcore = require('bitcore-lib');
var crypto = require('crypto');
var merge = require('merge');
var Message = require('bitcore-message');
var curve = bitcore.deps.elliptic.curves.secp256k1;
var ecdsa = new bitcore.deps.elliptic.ec(curve);

/**
 * Represents a ECDSA key pair
 * @constructor
 * @license LGPL-3.0
 * @param {String|Buffer|undefined} privateKey - WIF encoded ECDSA private key
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
 * @returns {String} key
 */
KeyPair.prototype.getPrivateKey = function() {
  return this._privkey.toString();
};

/**
 * Returns the public key
 * @returns {String} key
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

/**
 * Signs the supplied message with the private key
 * @param {String|Buffer} message - The message to sign
 * @param {Object} options
 * @param {Boolean} [options.compact=true] - Compact signature format
 * @returns {String} signature
 */
KeyPair.prototype.sign = function(message, options) {
  var sign = null;
  var opts = merge({ compact: true }, options);

  if (opts.compact) {
    sign = Message(message).sign(this._privkey);
  } else {
    if (!Buffer.isBuffer(message)) {
      message = new Buffer(message, 'utf8');
    }

    sign = ecdsa.sign(
      crypto.createHash('sha256').update(message).digest('hex'),
      this.getPrivateKey()
    ).toDER('hex');
  }

  return sign;
};

module.exports = KeyPair;
