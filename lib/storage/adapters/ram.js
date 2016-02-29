'use strict';

var inherits = require('util').inherits;
var StorageAdapter = require('../adapter');
var StorageItem = require('../item');

/**
 * Implements an in-memory storage adapter
 * @extends {StorageAdapter}
 * @constructor
 */
function RAMStorageAdapter() {
  if (!(this instanceof RAMStorageAdapter)) {
    return new RAMStorageAdapter();
  }

  this._items = {};
}

inherits(RAMStorageAdapter, StorageAdapter);

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
RAMStorageAdapter.prototype._get = function(key, callback) {
  var result = this._items[key];

  if (!result) {
    return callback(new Error('Shard data not found'));
  }

  callback(null, new StorageItem(result));
};

/**
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {StorageItem} item
 * @param {Function} callback
 */
RAMStorageAdapter.prototype._put = function(key, item, callback) {
  this._items[key] = item;

  callback();
};

module.exports = RAMStorageAdapter;
