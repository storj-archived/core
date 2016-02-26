'use strict';

var assert = require('assert');
var StorageAdapter = require('./storage/adapter');
var StorageItem = require('./storage/item');

/**
 * Interface for managing contracts, shards, and audits
 * @constructor
 * @param {StorageAdapter} storage - Storage adapter to use
 */
function Manager(storage) {
  if (!(this instanceof Manager)) {
    return new Manager(storage);
  }

  assert(storage instanceof StorageAdapter, 'Invalid storage adapter');

  this._storage = storage;
}

/**
 * Loads the storage {@link Item} at the given key
 * @param {String} hash - Shard hash to load data for
 * @param {Function} callback - Called with error or {@link StorageItem}
 */
Manager.prototype.load = function(hash, callback) {
  assert(typeof hash === 'string', 'Invalid key supplied');
  assert(hash.length === 40, 'Key must be 160 bit hex string');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  this._storage.get(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    if (!(item instanceof StorageItem)) {
      return callback(new Error('Storage adapter provided invalid result'));
    }

    callback(null, item);
  });
};

/**
 * Saves the storage {@link StorageItem} at the given key
 * @param {StorageItem} item - The {@link StorageItem} to store
 * @param {Function} callback - Called on complete
 */
Manager.prototype.save = function(item, callback) {
  assert(item instanceof StorageItem, 'Invalid storage item supplied');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  this._storage.put(item, callback);
};

module.exports = Manager;
