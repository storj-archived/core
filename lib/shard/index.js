'use strict';

var assert = require('assert');
var utils = require('../utils');

/**
 * Represents a data shard
 * @constructor
 * @param {Buffer} shard - Raw data shard
 * @param {Array} tree - Bottom leaves of audit merkle tree
 */
function Shard(shard, tree) {
  if (!(this instanceof Shard)) {
    return new Shard(shard, tree);
  }

  assert(Buffer.isBuffer(shard), 'Shard is not a valid buffer object');
  assert(Array.isArray(tree), 'Audit tree must be an array');
  assert(
    tree.length === utils.getNextPowerOfTwo(tree.length),
    'Invalid audit tree size, must be a power of 2'
  );

  this._data = shard;
  this._tree = tree;
}

/**
 * Returns the hash of the data
 */
Shard.prototype.getHash = function() {
  return utils.rmd160sha256(this._data);
};

/**
 * Returns the hex encoded data
 */
Shard.prototype.getData = function() {
  return this._data.toString('hex');
};

/**
 * Returns the bottom leaves of the audit tree
 */
Shard.prototype.getTree = function() {
  return JSON.stringify(this._tree);
};

module.exports = Shard;
