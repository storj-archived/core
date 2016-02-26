'use strict';

var assert = require('assert');
var MerkleTree = require('mtree');
var utils = require('./utils');

/**
 * Provides interface for proving possession of a file for an {@link Audit}
 * @constructor
 * @param {Object} options
 * @param {Array} options.leaves
 * @param {Buffer} options.shard
 */
function Proof(options) {
  if (!(this instanceof Proof)) {
    return new Proof(options);
  }

  assert(Array.isArray(options.leaves), 'Merkle leaves must be an array');
  assert(Buffer.isBuffer(options.shard), 'Invalid shard supplied');

  this._shard = options.shard;
  this._tree = new MerkleTree(
    this._generateLeaves(options.leaves),
    utils.rmd160sha256
  );

}

/**
 * Calculate audit response
 * @param {String} challenge
 * @returns {Array} result
 */
Proof.prototype.prove = function(challenge) {
  var response = utils.rmd160sha256(challenge + this._shard.toString('hex'));
  var leaf = utils.rmd160sha256(response);
  var leaves = this._tree.level(this._tree.levels() - 1);
  var challengenum = leaves.indexOf(leaf);

  assert(challengenum !== -1, 'Failed to generate proof');

  var branches = [response];

  for (var i = (this._tree.levels() - 1); i > 0; i--) {
    var level = this._tree.level(i);

    if (challengenum % 2 === 0) {
      branches = [branches, level[challengenum + 1]];
    } else {
      branches = [level[challengenum - 1], branches];
    }

    challengenum = Math.floor(challengenum / 2);
  }

  return branches;
};

/**
 * Generates the bottom leaves of the tree to the next power of two
 * @private
 * @param {Array} leaves
 */
Proof.prototype._generateLeaves = function(leaves) {
  var numEmpty = utils.getNextPowerOfTwo(leaves.length) - leaves.length;
  var emptyLeaves = [];

  for (var i = 0; i < numEmpty; i++) {
    emptyLeaves.push(utils.rmd160sha256(''));
  }

  return leaves.concat(emptyLeaves);
};

module.exports = Proof;
