'use strict';

var crypto = require('crypto');
var utils = require('../utils');

/**
 * Create a new random cipher key and initialization vector
 * @constructor
 * @license LGPL-3.0
 * @param {String|Buffer} [password] - The unique cipher password
 * @param {String|Buffer} [salt] - The unique salt
 */
function DataCipherKeyIv(pass, salt) {
  if (!(this instanceof DataCipherKeyIv)) {
    return new DataCipherKeyIv(pass, salt);
  }

  if (!pass && !salt) {
    pass = crypto.randomBytes(DataCipherKeyIv.PASS_BYTES);
    salt = crypto.randomBytes(DataCipherKeyIv.SALT_BYTES);
  }

  this._pass = Buffer.isBuffer(pass) ? pass : Buffer(pass, 'hex');
  this._salt = Buffer.isBuffer(salt) ? salt : Buffer(salt, 'hex');
  this._pbkdf2 = crypto.pbkdf2Sync(
    this._pass,
    this._salt,
    25000,
    512,
    'sha512'
  );
}

DataCipherKeyIv.PASS_BYTES = 512;
DataCipherKeyIv.SALT_BYTES = 32;

/**
 * Calculates a deterministic bucket key
 * @param {String} seed - Deterministic seed
 * @param {String} bucketId - Unique bucket id
 * @returns {String}
 */
DataCipherKeyIv.getHDBucketKey = function(seed, bucketId){
  var pass = Buffer.isBuffer(seed) ? seed : Buffer(seed, 'hex');
  var salt = Buffer.isBuffer(bucketId) ? bucketId : Buffer(bucketId, 'hex');

  var buffer = crypto.pbkdf2Sync(
    pass,
    salt,
    25000,
    512,
    'sha512'
  );
  return buffer.toString('hex').substring(0, 64);
};

/**
 * Calculates a deterministic file key
 * @param {String} bucketKey - key for the bucket
 * @param {String} fileId - Unique file id
 * @returns {DataCipherKeyIv}
 */
DataCipherKeyIv.getHDFileKey = function(bucketKey, fileId){
  return new DataCipherKeyIv(bucketKey, fileId);
};

/**
 * Returns the cipher key and iv in an array
 * @returns {Array}
 */
DataCipherKeyIv.prototype.getCipherKeyIv = function() {
 return [
   Buffer(utils.sha256(this._pbkdf2), 'hex'),
   Buffer(utils.rmd160(this._salt), 'hex').slice(0, 16)
 ];
};

/**
 * Returns the key and iv as an array
 * @returns {Array}
 */
DataCipherKeyIv.prototype.toObject = function() {
  return {
    pass: this._pass.toString('hex'),
    salt: this._salt.toString('hex')
  };
};

/**
 * Returns the a {@link DataCipherKeyIv} from an object
 * @param {Object} object
 * @param {Buffer|String} object.pass - The unique password
 * @param {Buffer|String} object.salt - The unique salt
 * @returns {DataCipherKeyIv}
 */
DataCipherKeyIv.fromObject = function(object) {
  return new DataCipherKeyIv(object.pass, object.salt);
};

module.exports = DataCipherKeyIv;
