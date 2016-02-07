'use strict';

var assert = require('assert');
var utils = require('../utils');

/**
 * Interface for verifying the result of an audit proof
 * @constructor
 * @param {Array} proof - The result of {@link Proof#prove}
 */
function Verification(proof) {
  if (!(this instanceof Verification)) {
    return new Verification(proof);
  }

  assert(Array.isArray(proof), 'Proof must be an array');

  this._proof = proof;
}

/**
 * Verifies the proof given the merkle root and tree depth
 * @param {String} root
 * @param {Number} totaldepth
 * @returns {Boolean} verified
 */
Verification.prototype.verify = function(root, totaldepth) {
  root = root.toLowerCase();

  function _verify(proof, depth) {
    // TODO: I will kill myself if i have to call String#toLowerCase() one
    // TODO: more time. Fix the library if you have to.
    proof = proof.map(function(leaf) {
      return Array.isArray(leaf) ? leaf : leaf.toLowerCase();
    });

    // TODO: Are we sure we need to hash this?
    if (proof.length === 1) {
      return utils.sha256(proof[0]);
    }

    var result;

    if (Array.isArray(proof[0])) {
      result = utils.sha256(_verify(proof[0], depth + 1) + proof[1]);
    } else {
      result = utils.sha256(proof[0] + _verify(proof[1], depth + 1));
    }

    // TODO: Do we need to double SHA the deepest leaf?
    if (depth === totaldepth) {
      return utils.sha256(result);
    } else {
      return result;
    }
  }

  // TODO: Why the fuck is this broken?
  return [_verify(this._proof, 0), root];
};

module.exports = Verification;
