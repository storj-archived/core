'use strict';

var assert = require('assert');
var Contract = require('../contract');
var merge = require('merge');

/**
 * Represents a storage item, including contracts, challenges, the shard itself
 * along with metadata describing download count, payments, etc
 * @constructor
 * @license AGPL-3.0
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

  data = merge({}, data);

  this.hash = null;
  this.shard = null;
  this.contracts = {};
  this.trees = data.trees || {};
  this.challenges = data.challenges || {};
  this.meta = data.meta || {};
  this.modified = data.modified || Date.now();

  this._init(data);
}

/**
 * Adds the trees and challenges to the item keyed by nodeID
 * @param {Contact} contact - The contact associated with the trees
 * @param {Audit|AuditStream} audit - The audit or challenge generator
 */
StorageItem.prototype.addAuditRecords = function(contact, audit) {
  this.trees[contact.nodeID] = audit.getPublicRecord();
  this.challenges[contact.nodeID] = audit.getPrivateRecord();

  return this;
};

/**
 * Adds the contract data keyed by nodeID
 * @param {Contact} contact - The contact associated with the trees
 * @param {Contract} contract - The storage contract instance
 */
StorageItem.prototype.addContract = function(contact, contract) {
  this.contracts[contact.nodeID] = contract;

  return this;
};

/**
 * Adds the meta data keyed by nodeID
 * @param {Contact} contact - The contact associated with the trees
 * @param {Object} meta - Arbitrary metadata about the shard
 */
StorageItem.prototype.addMetaData = function(contact, meta) {
  this.meta[contact.nodeID] = meta;

  return this;
};

/**
 * Updates the timestamp for the item
 */
StorageItem.prototype.updateTimestamp = function() {
  this.modified = Date.now();

  return this;
};

/**
 * Returns a plain object representation of the item
 */
StorageItem.prototype.toObject = function() {
  var contracts = {};

  for (var c in this.contracts) {
    contracts[c] = this.contracts[c].toObject();
  }

  return {
    hash: this.hash,
    shard: null,
    contracts: contracts,
    challenges: this.challenges,
    trees: this.trees,
    meta: this.meta,
    modified: this.modified
  };
};

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
