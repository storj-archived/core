'use strict';

const inherits = require('util').inherits;
const HDKey = require('hdkey');
const KeyPair = require('./keypair');

const STORJ_VERSIONS = {
  private: 0xef69eb5f,
  public: 0xef6adfe4
};

function HDKeyPair() {
  HDKey.call(this, STORJ_VERSIONS);
}
inherits(HDKeyPair, HDKey);

HDKeyPair.prototype.toKeyPair = function() {
  if (this._privateKey) {
    return new KeyPair(this._privateKey.toString('hex'));
  }
  return null;
};

HDKeyPair.fromMasterSeed = function(seedBuffer) {
  var key = new HDKeyPair();
  var k = HDKey.fromMasterSeed(seedBuffer, STORJ_VERSIONS);
  key.chainCode = k.chainCode;
  key.privateKey = k.privateKey;
  return key;
};

HDKeyPair.fromExtendedKey = function(base58key) {
  var key = new HDKeyPair();
  var k = HDKey.fromExtendedKey(base58key, STORJ_VERSIONS);
  key.depth = k.depth;
  key.parentFingerprint = k.parentFingerprint;
  key.index = k.index;
  key.chainCode = k.chainCode;
  key._privateKey = k._privateKey;
  key._publicKey = k._publicKey;
  key._fingerprint = k._fingerprint;
  key._identifier = k._identifier;
  return key;
};

module.exports = HDKeyPair;
