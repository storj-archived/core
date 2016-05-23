/**
 * @module storj/utils
 */

'use strict';

var KeyPair = require('./keypair');
var crypto = require('crypto');
var semver = require('semver');
var ip = require('ip');
var bitcore = require('bitcore-lib');
var ECIES = require('bitcore-ecies');

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
  var local = require('./version').protocol;
  var remote = version;
  var sameMajor = semver.major(local) === semver.major(remote);
  var sameMinor = semver.minor(local) === semver.minor(remote);
  var diffs = ['prerelease', 'prepatch', 'preminor', 'premajor'];

  if (diffs.indexOf(semver.diff(remote, local)) !== -1) {
    return false;
  } else if (semver.major(local) === 0 && sameMajor) {
    return sameMinor;
  } else {
    return sameMajor;
  }
};

/**
 * Determines if the supplied contact is valid
 * @param {Contact} contact - The contact information for a given peer
 * @param {Boolean} loopback - Allows contacts that are localhost
 * @returns {Boolean}
 */
module.exports.isValidContact = function(contact, loopback) {
  if (!contact) {
    return false;
  }

  var isValidAddr = ip.isV4Format(contact.address) ||
                    ip.isV6Format(contact.address) ||
                    ip.isPublic(contact.address);
  var isValidPort = contact.port > 0;
  var isAllowedAddr = ip.isLoopback(contact.address) ? !!loopback : true;

  return isValidPort && isValidAddr && isAllowedAddr;
};

/**
 * Creates an ECIES ciper object from a private and a public key
 * @param {String} privateKey - The private key of the sender
 * @param {String} publicKey - The public key of the recipient
 * @returns {Object}
 */
module.exports.createEciesCipher = function(privateKey, publicKey) {
  var cipher = ECIES();

  cipher.privateKey(KeyPair(privateKey)._privkey);
  cipher.publicKey(bitcore.PublicKey.fromDER(Buffer(publicKey, 'hex')));

  return cipher;
};
