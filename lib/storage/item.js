'use strict';

var assert = require('assert');
var Contract = require('../contract');

/**
 * Represents a storage item, including contracts, challengs, the shard itself
 * along with metadata describing download count, payments, etc
 * @constructor
 * @param {Object} data
 * @param {String|null} data.hash - Shard hash to use as storage key
 * @param {Stream|null} data.shard - Raw binary blob of shard
 * @param {Object} data.contracts - Dictionary of nodeID:{@link Contract}
 * @param {Object} data.trees - Dictionary of nodeID:merkleLeaves
 * @param {Object} data.challenges - Dictionary of nodeID:privateAuditData
 * @param {Object} data.meta - Dictionary of arbitrary nodeID:metadata
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

  this.shard = data.shard || null;
  this.hash = data.hash || null;

  for (var nodeID in data.contracts) {
    this.contracts[nodeID] = new Contract(data.contracts[nodeID]);
  }

  return this;
};

module.exports = StorageItem;
