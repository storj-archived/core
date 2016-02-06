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
 * @param {String|Buffer} root
 * @returns {Boolean} verified
 */
Verification.prototype.verify = function(root) {
  if (!Buffer.isBuffer(root)) {
    root = new Buffer(root, 'hex');
  }

  function _verify(proof, depth) {
    if (proof.length === 1) {
      return utils.sha256(Buffer(proof[0], 'hex'));
    }

    if (Array.isArray(proof[0])) {
      return utils.sha256(
        Buffer.concat([
          Buffer(_verify(proof[0], depth + 1), 'hex'),
          Buffer(proof[1], 'hex')
        ])
      );
    } else {
      return utils.sha256(
        Buffer.concat([
          Buffer(proof[0], 'hex'),
          Buffer(_verify(proof[1], depth + 1), 'hex')
        ])
      );
    }
  }

  return root.compare(_verify(this._proof, 0)) === 0;
};

module.exports = Verification;
