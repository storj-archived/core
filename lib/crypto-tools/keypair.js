'use strict';

const bitcore = require('bitcore-lib');
const crypto = require('crypto');
const merge = require('merge');
const secp256k1 = require('secp256k1');

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
 * Returns the private key padded at 32 bytes
 * @returns {String} key
 */
KeyPair.prototype.getPrivateKeyPadded = function() {
  return this._privkey.bn.toBuffer({size: 32}).toString('hex');
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
  var signobj = null;
  var opts = merge({ compact: true }, options);

  if (!Buffer.isBuffer(message)) {
    message = new Buffer(message, 'utf8');
  }

  signobj = secp256k1.sign(
    crypto.createHash('sha256').update(message).digest(),
    this._privkey.toBuffer()
  )

  if (opts.compact) {
    sign = bitcore.crypto.Signature.fromDER(
      secp256k1.signatureExport(signobj.signature)
    ).toCompact(signobj.recovery, false).toString('base64');
  } else {
    sign = secp256k1.signatureExport(signobj.signature).toString('hex');
  }

  return sign;
};

module.exports = KeyPair;
