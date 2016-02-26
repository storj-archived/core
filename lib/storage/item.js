'use strict';

var assert = require('assert');
var utils = require('../utils');
var Contract = require('../contract');

/**
 * Represents a storage item, including contracts, challengs, the shard itself
 * along with metadata describing download count, payments, etc
 * @constructor
 * @param {Object} data
 */
function StorageItem(data) {
  if (!(this instanceof StorageItem)) {
    return new StorageItem(data);
  }

  data = data || {};

  this.hash = null;
  this.shard = null;
  this.contracts = {};
  this.trees = data.trees || {};
  this.challenges = data.challenges || {};
  this.meta = data.meta || {};

  this._init(data);
}

/**
 * Initializes the item values with the given data
 * @private
 * @param {Object} data
 * @returns {StorageItem}
 */
StorageItem.prototype._init = function(data) {
  assert(typeof data === 'object', 'Invalid item data supplied');

  this.shard = Buffer.isBuffer(data.shard) ? data.shard : null;
  this.hash = this.shard ? utils.rmd160sha256(data.shard) : (data.hash || null);

  for (var nodeID in data.contracts) {
    this.contracts[nodeID] = new Contract(data.contracts[nodeID]);
  }

  return this;
};

module.exports = StorageItem;
