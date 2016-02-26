'use strict';

var assert = require('assert');
var Item = require('./item');

/**
 * Abstract base class for storage adapter
 * @constructor
 */
function StorageAdapter() {
  if (!(this instanceof StorageAdapter)) {
    return new StorageAdapter();
  }
}

/**
 * Calls the implemented {@link StorageAdapter#_get} and validates the result
 * @param {String} key - Shard hash to get metadata for
 * @param {Function} callback - Called with error or {@link StorageItem}
 */
StorageAdapter.prototype.get = function(key, callback) {
  assert(typeof key === 'string', 'Invalid key supplied');
  assert(key.length === 40, 'Key must be 160 bit hex string');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  return this._get(key, callback);
};

/**
 * Calls the implemented {@link StorageAdapter#_put} and validates the input
 * @param {StorageItem} item - Item to write to storage
 * @param {Function} callback - Called on complete write
 */
StorageAdapter.prototype.put = function(item, callback) {
  assert(item instanceof Item, 'Invalid storage item supplied');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  return this._put(item.hash, item, callback);
};

/**
 * Performs lookup and provides an {@link StorageItem} to the callback
 * @abstract
 * @param {String} key - Shard hash
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._get = function(/* key, callback */) {
  throw new Error('Method not implemented');
};

/**
 * Stores the {@link StorageItem}
 * @abstract
 * @param {String} key - Shard hash
 * @param {Item} item - Item to store
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._put = function(/* item, callback */) {
  throw new Error('Method not implemented');
};

module.exports = StorageAdapter;
