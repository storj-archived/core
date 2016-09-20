'use strict';

var assert = require('assert');
var utils = require('../utils');

/**
 * Interface for verifying the result of an audit proof
 * @constructor
 * @license LGPL-3.0
 * @param {Array} proof - The result of {@link ProofStream#getProofResult}
 */
function Verification(proof) {
  if (!(this instanceof Verification)) {
    return new Verification(proof);
  }

  assert(Array.isArray(proof), 'Proof must be an array');

  this._proof = proof;
}

/**
 * Extracts the challenge response from the proof
 * @private
 * @param {Array} response - Challenge response received from farmer
 * @returns {String} leaf
 */
Verification.prototype._getChallengeResponse = function(tuple) {
  var data = tuple || this._proof;

  if (data.length === 1) {
    return utils.rmd160sha256(data[0]);
  }

  if (Array.isArray(data[0])) {
    return this._getChallengeResponse(data[0]);
  } else {
    return this._getChallengeResponse(data[1]);
  }
};

/**
 * Verifies the proof given the merkle root and tree depth
 * @param {String} merkleRoot - Merkle root
 * @param {Number} totalDepth - Depth of merkle tree
 * @returns {Array} result - Array with expected result and verified result
 */
Verification.prototype.verify = function(root, totaldepth) {
  function _collapse(proof, leaf, depth) {
    if (depth === 0) {
      assert(proof.length === 1, 'Invalid proof structure');
      assert(utils.rmd160sha256(proof[0]) === leaf, 'Invalid proof value');

      return leaf;
    }

    var hashL, hashR;

    if (Array.isArray(proof[0])) {
      hashL = _collapse(proof[0], leaf, depth - 1);
    } else {
      hashL = proof[0];
    }

    if (Array.isArray(proof[1])) {
      hashR = _collapse(proof[1], leaf, depth - 1);
    } else {
      hashR = proof[1];
    }

    return utils.rmd160sha256(hashL + hashR);
  }

  return [
    _collapse(this._proof, this._getChallengeResponse(), totaldepth - 1),
    root
  ];
};

module.exports = Verification;
