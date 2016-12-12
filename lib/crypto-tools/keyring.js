'use strict';

var assert = require('assert');
var fs = require('fs');
var DataCipherKeyIv = require('../crypto-tools/cipher-key-iv');
var DeterministicKeyIv = require('../crypto-tools/deterministic-key-iv');
var crypto = require('crypto');
var path = require('path');
var targz = require('node-tar.gz');
var os = require('os');
var utils = require('../utils');
var constants = require('../constants');
var Mnemonic = require('bitcore-mnemonic');

/**
 * A {@link DataCipherKeyIv} factory with file system persistence
 * @constructor
 * @license LGPL-3.0
 * @param {String} keyRingDir - Path to store keyring directory
 * @param {String} [passPhrase=''] - Passphrase to encrypt/decrypt keyring
 */
function KeyRing(filePath, passPhrase) {
  if (!(this instanceof KeyRing)) {
    return new KeyRing(filePath, passPhrase);
  }

  assert(typeof filePath === 'string', 'Invalid path supplied to keyring');

  this._keyFolder = path.join(filePath, 'key.ring');
  this._pass = passPhrase || '';
  this._deterministicKeyFile = path.join(this._keyFolder, '.deterministic_key');
  this._mnemonic = null;

  if (!utils.existsSync(this._keyFolder)) {
    fs.mkdirSync(this._keyFolder);
  }

  this._verify();
  this._migrateOld(path.join(filePath, 'keyring'));
  this._readDeterministicKey();
}

KeyRing.DEFAULTS = {
  algorithm: constants.CIPHER_ALG
};

/**
  * Verify the password supplied is correct for the previously created keys.
  * @private
  */
KeyRing.prototype._verify = function() {
  if (!utils.existsSync(path.join(this._keyFolder, '.verify'))) {
    this.generate('.verify');
  }

  try {
    this.get('.verify');
  } catch (err) {
    throw new Error('Invalid passphrase was supplied to KeyRing');
  }
};

/**
  * Migrate the old keyring to new key.ring folder
  * @private
  * @param {String} oldPath - path to the old keyring
  */
KeyRing.prototype._migrateOld = function(oldPath) {
  if (utils.existsSync(oldPath)) {
    var oldKeyRing;

    try {
      oldKeyRing = JSON.parse(
        this._decrypt(fs.readFileSync(oldPath).toString())
      );
    } catch (err) {
      return fs.unlinkSync(oldPath);
    }

    for (var key in oldKeyRing) {
      var file = path.join(this._keyFolder, key);

      if (!utils.existsSync(file)) {
        fs.writeFileSync(
          file,
          this._encrypt(JSON.stringify(oldKeyRing[key]))
        );
      }
    }

    fs.unlinkSync(oldPath);
  }
};

/**
 * Export Keyring to compressed tarball
 * @param {String} outPath - Path to keyring to be compressed
 * @param {Function} callback - Called when tarball has been written
 */
KeyRing.prototype.export = function(tar, callback) {
  var read = targz().createReadStream(this._keyFolder);
  var write = fs.createWriteStream(tar);

  read.pipe(write).on('finish', callback).on('error', callback);
};

/**
 * Import to Keyring from compressed tarball
 * @param {String} inPath - Path to tarball to be imported
 * @param {String} passPhrase - Passphrase used to decrypt the imported tar
 * @param {Boolean} [overwriteConflictingIds=false] - Overwrite conflicting key
 * @param {Function} callback - Called on import finish
 */
KeyRing.prototype.import = function(tar, passphrase, writeflag, callback) {
  var self = this;
  var read = fs.createReadStream(tar);
  var parse = targz().createParseStream();

  if (typeof writeflag === 'function') {
    callback = writeflag;
    writeflag = false;
  }

  function worker(entry, done) {
    var key = path.basename(entry.path);
    var keyPath = path.join(self._keyFolder, key);

    if (!utils.existsSync(keyPath) || writeflag === true) {
      var buf = '';

      entry.on('data', function(data) {
        buf += data;
      });

      entry.resume();

      entry.on('end', function() {
        var decrypted;

        if (key === 'key.ring' || key === '.DS_Store') {
          return entry.abort();
        }

        try {
          decrypted = self._encrypt(
            KeyRing.prototype._decrypt.call({ _pass: passphrase }, buf)
          );
        } catch (err) {
          parse.removeAllListeners('end');
          return callback(new Error('Failed to decrypt keyring'));
        }

        fs.writeFileSync(keyPath, decrypted, done);
      });
    }
  }

  parse.on('entry', worker).on('end', callback);
  read.pipe(parse);
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} keyId - Arbitrary key ID to load
 * @returns {DataCipherKeyIv|DeterministicKeyIv|null}
 */
KeyRing.prototype.get = function(id, bucket) {
  var file = path.join(this._keyFolder, id);

  if (!utils.existsSync(file)) {
    if (!this._mnemonic) {
      return null;
    }
    return this.generateFileKey(bucket, id);
  }

  var fileData = this._decrypt(fs.readFileSync(file).toString());
  var keyObject = JSON.parse(fileData);
  if (keyObject.type === 'DeterministicKeyIv') {
    return DeterministicKeyIv.fromObject(keyObject);
  }
  return DataCipherKeyIv.fromObject(keyObject);
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} keyId - Generate a key for use with the given ID
 * @returns {KeyPair}
 */
KeyRing.prototype.generate = function(id) {
  return this.set(id, DataCipherKeyIv());
};

/**
 * Returns the stored {@link KeyPair} for the given id
 * @param {String} keyId - Arbitrary key ID to load
 * @param {DataCipherKeyIv|DeterministicKeyIv} dataCipherKey
 */
KeyRing.prototype.set = function(id, cipherKeyIv) {
  this._saveKeyToDisk(id, cipherKeyIv.toObject());

  return cipherKeyIv;
};

/**
 * Saves the keyring file to disk
 * @private
 */
KeyRing.prototype._saveKeyToDisk = function(id, cipherKeyIv) {
  return fs.writeFileSync(
    path.join(this._keyFolder, id),
    this._encrypt(JSON.stringify(cipherKeyIv))
  );
};

/**
 * Delete the keyring file from disk
 * @param {String} keyId - Arbitrary key ID to delete
 */
KeyRing.prototype.del = function(id) {
  var key = path.join(this._keyFolder, id);

  if (utils.existsSync(key)) {
    return fs.unlinkSync(key);
  }
};

/**
 * Resets the keyring password
 * @param {String} passPhrase - New passphrase for keyring
 * @param {Function} callback - Called on keyring password reset
 */
KeyRing.prototype.reset = function(newpass, callback) {
  var self = this;
  var tmp = os.tmpdir();
  var tarball = path.join(tmp, 'keyring.bak.' + Date.now() + '.tgz');
  var oldpass = this._pass;

  if (!newpass || !newpass.length) {
    return callback(new Error('Your Password cannot be blank!'));
  }

  this.export(tarball, function(err) {
    if (err) {
      return callback(err);
    }

    self._pass = newpass;
    self.del('.verify');

    self.import(tarball, oldpass, true, function(err) {
      callback(err);
      fs.unlinkSync(tarball);
    });
  });
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

  return JSON.parse(dec) && dec;
};

/**
 * Retrieve the bucketKey
 * @param {String} bucketId - bucket id
 * @returns {String|null}
 */
KeyRing.prototype.generateBucketKey = function(bucketId) {
  if (!this._mnemonic || !bucketId) {
    return null;
  }
  return DeterministicKeyIv.getDeterministicKey(
    this._mnemonic.toSeed(),
    Buffer.from(bucketId, 'hex')
  );
};

/**
 * Retrieve the fileKey
 * @param {String} bucketId - bucket id
 * @param {String} fileId - file id
 * @returns {DataCipherKeyIv}
 */
KeyRing.prototype.generateFileKey = function(bucketId, fileId) {
  var self = this;

  var bucketKey = self.generateBucketKey(bucketId);
  if (!bucketKey) {
    return DataCipherKeyIv();
  }

  var fileKey = DeterministicKeyIv.getDeterministicKey(
    Buffer.from(bucketKey, 'hex'),
    Buffer.from(fileId, 'hex')
  );
  return new DeterministicKeyIv(fileKey, fileId);
};

/**
 * Read a deterministic key from disk
 * @private
 */
KeyRing.prototype._readDeterministicKey = function() {
  if (!utils.existsSync(this._deterministicKeyFile)) {
    return;
  }
  var enc = fs.readFileSync(this._deterministicKeyFile).toString();
  this._mnemonic = new Mnemonic(JSON.parse(this._decrypt(enc)).mnemonic);
};

/**
 * Generate and save deterministic key to disk
 */
KeyRing.prototype.generateDeterministicKey = function() {

  assert(
    !utils.existsSync(this._deterministicKeyFile),
    'Deterministic key already exists'
  );

  this._mnemonic = new Mnemonic(Mnemonic.Words.ENGLISH);
  this._saveKeyToDisk('.deterministic_key', {
    mnemonic: this._mnemonic.toString()
  });
};

/**
 * Import mnemonic into KeyRing
 * @param {String} mnemonic - Mnemonic to transfer
 */
KeyRing.prototype.importMnemonic = function(mnemonic) {

  assert(
    !utils.existsSync(this._deterministicKeyFile),
    'Deterministic key already exists'
  );

  assert(Mnemonic.isValid(mnemonic), 'Mnemonic is invalid');

  this._mnemonic = new Mnemonic(mnemonic);
  this._saveKeyToDisk('.deterministic_key', {
    mnemonic: this._mnemonic.toString()
  });
};

/**
 * Export mnemonic from KeyRing
 * @returns {String|null}
 */
KeyRing.prototype.exportMnemonic = function() {
  if (!this._mnemonic) {
    return null;
  }
  return this._mnemonic.toString();
};

/**
 * Delete deterministic key from disk
 */
KeyRing.prototype.deleteDeterministicKey = function() {
  this.del('.deterministic_key');
};

module.exports = KeyRing;
