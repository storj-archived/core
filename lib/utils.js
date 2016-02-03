/**
 * @module storj/utils
 */

'use strict';

var crypto = require('crypto');
var bs58 = require('bs58');
var constants = require('./constants');

/**
 * Returns the Node ID derived from the given public key
 * @param {String|Buffer} pubkey - Hex encoded ECDSA public key
 * @returns {String} nodeID
 */
exports.getNodeIDFromPublicKey = function(pubkey) {
  var pubkeyBuffer;

  if (!Buffer.isBuffer(pubkey)) {
    pubkeyBuffer = new Buffer(pubkey, 'hex');
  } else {
    pubkeyBuffer = pubkey;
  }

  var prefix = new Buffer([constants.PREFIX]);
  var pubHash = crypto.createHash('sha256').update(pubkeyBuffer).digest();
  var pubRipe = crypto.createHash('rmd160').update(pubHash).digest();
  var pubPrefixed = Buffer.concat([prefix, pubRipe]);
  var hash1 = crypto.createHash('sha256').update(pubPrefixed).digest();
  var checksumTotal = crypto.createHash('sha256').update(hash1).digest();
  var checksum = checksumTotal.slice(0, 4);
  var pubWithChecksum = Buffer.concat([pubPrefixed, checksum]);
  var nodeID = bs58.encode(pubWithChecksum);

  return nodeID;
};
