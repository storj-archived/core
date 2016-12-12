'use strict';

var assert = require('assert');
var utils = require('../utils');

/**
 * Create a new deterministic cipher key
 * @constructor
 * @license LGPL-3.0
 * @param {String} fileKey - file key
 * @param {String} fileId - file id
 */
function DeterministicKeyIv(fileKey, fileId) {
  if (!(this instanceof DeterministicKeyIv)) {
    return new DeterministicKeyIv(fileKey, fileId);
  }

  this._pass = fileKey;
  this._salt = fileId;
}

/**
 * Calculates a deterministic key
 * @param {Buffer|String} seed - Deterministic seed or bucket key
 * @param {Buffer|String} id - Unique bucket or file id
 * @returns {String}
 */
DeterministicKeyIv.getDeterministicKey = function(key, id){
  if (!Buffer.isBuffer(key)) {
    assert(utils.isHexaString(key),
           'key is expected to be a buffer or hex string');
    key = Buffer.from(key, 'hex');
  }
  if (!Buffer.isBuffer(id)) {
    assert(utils.isHexaString(id),
           'id is expected to be a buffer or hex string');
    id = Buffer.from(id, 'hex');
  }
  var buffer = utils.sha512(Buffer.concat([key, id]));
  return buffer.toString('hex').substring(0, 64);
};

/**
 * Returns the cipher key and iv in an array
 * @returns {Array}
 */
DeterministicKeyIv.prototype.getCipherKeyIv = function() {
  return [
    Buffer(utils.sha256(this._pass), 'hex'),
    Buffer(utils.rmd160(this._salt), 'hex').slice(0, 16)
  ];
};

/**
 * Returns the key and iv as an array
 * @returns {Array}
 */
DeterministicKeyIv.prototype.toObject = function() {
  return {
    type: 'DeterministicKeyIv',
    pass: this._pass,
    salt: this._salt
  };
};

/**
 * Returns the a {@link DeterministicKeyIv} from an object
 * @param {Object} object
 * @param {Buffer|String} object.pass - The unique password
 * @param {Buffer|String} object.salt - The unique salt
 * @returns {DeterministicKeyIv}
 */
DeterministicKeyIv.fromObject = function(object) {
  return new DeterministicKeyIv(object.pass, object.salt);
};

module.exports = DeterministicKeyIv;
