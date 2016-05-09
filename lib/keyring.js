'use strict';

var assert = require('assert');
var fs = require('fs');
var KeyPair = require('./keypair');
var crypto = require('crypto');

/**
 * A {@link KeyPair} factory with file system persistence
 * @constructor
 * @param {String} filePath - Path to store keyring file
 * @param {String} passPhrase - Passphrase to encrypt/decrypt keyring
 */
function KeyRing(filePath, passPhrase) {
  if (!(this instanceof KeyRing)) {
    return new KeyRing(filePath, passPhrase);
  }

  assert(typeof filePath === 'string', 'Invalid path supplied to keyring');

  this._path = filePath;
  this._pass = passPhrase || '';
  this._keys = this._loadKeyRingFromDisk();
}

KeyRing.DEFAULTS = {
  algorithm: 'aes-256-ctr'
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} id - Arbitrary key ID to load
 * @returns {KeyPair|null}
 */
KeyRing.prototype.loadKey = function(id) {
  if (!this._keys[id]) {
    return null;
  }

  return new KeyPair(this._keys[id]);
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} id - Generate a key for use with the given ID
 * @returns {KeyPair}
 */
KeyRing.prototype.generateKey = function(id) {
  this._keys[id] = KeyPair().getPrivateKey();

  this._saveKeyRingToDisk();

  return new KeyPair(this._keys[id]);
};

/**
 * Loads or creates the keyring file
 * @private
 */
KeyRing.prototype._loadKeyRingFromDisk = function() {
  if (!fs.existsSync(this._path)) {
    fs.writeFileSync(this._path, this._encrypt(JSON.stringify({})));
  }

  return JSON.parse(this._decrypt(fs.readFileSync(this._path).toString()));
};

/**
 * Saves the keyring file to disk
 * @private
 */
KeyRing.prototype._saveKeyRingToDisk = function() {
  return fs.writeFileSync(
    this._path,
    this._encrypt(JSON.stringify(this._keys))
  );
};

/**
 * Encrypts the data with the passphrase
 * @private
 * @param {String} data - Data to encrypt
 */
KeyRing.prototype._encrypt = function(data) {
  var cipher = crypto.createCipher(KeyRing.DEFAULTS.algorithm, this._pass);
  var enc = cipher.update(data, 'utf8', 'hex');

  enc += cipher.final('hex');

  return enc;
};

/**
 * Decrypts the data with the passphrase
 * @private
 * @param {String|Buffer} data - Data to encrypt
 */
KeyRing.prototype._decrypt = function(data) {
  var decipher = crypto.createDecipher(KeyRing.DEFAULTS.algorithm, this._pass);
  var dec = decipher.update(data, 'hex', 'utf8');

  dec += decipher.final('utf8');

  return dec;
};

module.exports = KeyRing;
