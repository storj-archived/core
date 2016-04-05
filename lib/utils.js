/**
 * @module storj/utils
 */

'use strict';

var crypto = require('crypto');
var semver = require('semver');

/**
 * Returns the SHA-256 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @returns {String}
 */
module.exports.sha256 = function(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
};

/**
 * Returns the RIPEMD-160 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @returns {String}
 */
module.exports.rmd160 = function(input) {
  return crypto.createHash('rmd160').update(input).digest('hex');
};

/**
 * Returns the RIPEMD-160 SHA-256 hash of this input
 * @param {String|Buffer} input - Data to hash
 * @returns {String}
 */
module.exports.rmd160sha256 = function(input) {
  return module.exports.rmd160(module.exports.sha256(input));
};

/**
 * Returns the next power of two number
 * @param {Number} number
 * @returns {Number}
 */
module.exports.getNextPowerOfTwo = function(num) {
  return Math.pow(2, Math.ceil(Math.log(num) / Math.log(2)));
};

/**
 * Generates a unique token
 * @returns {String}
 */
module.exports.generateToken = function() {
  return module.exports.rmd160sha256(crypto.randomBytes(512));
};

/**
 * Returns a stringified URL from the supplied contact object
 * @param {Object} contact
 * @param {String} contact.address
 * @param {Number} contact.port
 * @param {String} contact.nodeID
 * @returns {String}
 */
module.exports.getContactURL = function(contact) {
  return [
    'storj://', contact.address, ':', contact.port, '/', contact.nodeID
  ].join('');
};

/**
 * Returns whether or not the supplied semver tag is compatible
 * @param {String} version - The semver tag from the contact
 * @returns {Boolean} compatible
 */
module.exports.isCompatibleVersion = function(version) {
  var local = require('./version');
  var remote = version;
  var sameMajor = semver.major(local) === semver.major(remote);
  var sameMinor = semver.minor(local) === semver.minor(remote);
  var diffs = ['prepatch','preminor','premajor'];

  if (diffs.indexOf(semver.diff(remote, local)) !== -1) {
    return false;
  } else if (semver.major(local) === 0 && sameMajor) {
    return sameMinor;
  } else {
    return sameMajor;
  }
};
