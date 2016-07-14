'use strict';

var assert = require('assert');
var fs = require('fs');
var DataCipherKeyIv = require('./cipherkeyiv');
var crypto = require('crypto');
var path = require('path');

/**
 * A {@link DataCipherKeyIv} factory with file system persistence
 * @constructor
 * @param {String} filePath - Path to store keyring file
 * @param {String} passPhrase - Passphrase to encrypt/decrypt keyring
 */
function KeyRing(filePath, passPhrase) {
  if (!(this instanceof KeyRing)) {
    return new KeyRing(filePath, passPhrase);
  }

  assert(typeof filePath === 'string', 'Invalid path supplied to keyring');

  this._keyFolder = path.join(filePath, 'key.ring/');
  this._pass = passPhrase || '';

  if (!fs.existsSync(this._keyFolder)) {
    fs.mkdirSync(this._keyFolder);
  }

  this._migrateOld(path.join(filePath, 'keyring'));
}

KeyRing.DEFAULTS = {
  algorithm: 'aes-256-ctr'
};

/**
  * Migrate that old shit to new shit
  */
KeyRing.prototype._migrateOld = function(oldPath) {
  if (fs.existsSync(oldPath)) {
    var oldKeyRing = JSON.parse(this._decrypt(fs.readFileSync(oldPath).toString()));

    for (var key in oldKeyRing) {
      var file = path.join(this._keyFolder, key)
      if (!fs.existsSync(file)) {
        fs.writeFileSync(
          file,
          this._encrypt(JSON.stringify(oldKeyRing[key]))
        );
      };
    };

  }
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} id - Arbitrary key ID to load
 * @returns {KeyPair|null}
 */
KeyRing.prototype.get = function(id) {
  var file = path.join(this._keyFolder, id);

  if (!fs.exists(file)) {
    return null;
  }

  return DataCipherKeyIv.fromObject(fs.readFileSync(file));
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} id - Arbitrary key ID to load
 * @param {KeyPair} keypair - KeyPair instance to set
 */
KeyRing.prototype.set = function(id, cipherKeyIv) {
  this._saveKeyToDisk(id, cipherKeyIv.toObject());

  return cipherKeyIv;
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} id - Generate a key for use with the given ID
 * @returns {KeyPair}
 */
KeyRing.prototype.generate = function(id) {
  return this.set(id, DataCipherKeyIv());
};

/**
 * Saves the keyring file to disk
 * @private
 */
KeyRing.prototype._saveKeyToDisk = function(id, cipherKeyIv) {
  var file = path.join(this._keyFolder, id);
  if (!fs.existsSync(file)) {
    return fs.writeFileSync(
        path.join(this._keyFolder, id),
        this._encrypt(JSON.stringify(cipherKeyIv))
      );
    }
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
