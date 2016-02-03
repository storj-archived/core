'use strict';

var utils = require('./utils');
var elliptic = require('elliptic');
var ecdsa = new elliptic.ec(elliptic.curves.secp256k1);

/**
 * Represents a ECDSA key pair
 * @constructor
 * @param {String|Buffer} privkey
 */
function KeyPair(privkey) {
  if (!(this instanceof KeyPair)) {
    return new KeyPair(privkey);
  }

  if (privkey) {
    this._keypair = ecdsa.keyFromPrivate(privkey);
  } else {
    this._keypair = ecdsa.genKeyPair();
  }
}

/**
 * Returns the private key
 * @returns {Buffer}
 */
KeyPair.prototype.getPrivateKey = function() {
  return this._keypair.getPrivate();
};

/**
 * Returns the public key
 * @returns {Buffer}
 */
KeyPair.prototype.getPublicKey = function() {
  var pubkey, pubkeyobj = this._keypair.getPublic();
  var xbuf = new Buffer(pubkeyobj.x.toString('hex', 64), 'hex');
  var ybuf = new Buffer(pubkeyobj.y.toString('hex', 64), 'hex');

  if (ybuf[ybuf.length - 1] % 2) {
    pubkey = Buffer.concat([new Buffer([3]), xbuf]);
  } else {
    pubkey = Buffer.concat([new Buffer([2]), xbuf]);
  }

  return pubkey;
};

/**
 * Returns the NodeID derived from the public key
 * @returns {String} nodeID - Base58 encoded Node ID
 */
KeyPair.prototype.getNodeID = function() {
  return utils.getNodeIDFromPublicKey(this.getPublicKey().toString('hex'));
};

module.exports = KeyPair;
