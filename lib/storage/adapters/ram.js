'use strict';

var inherits = require('util').inherits;
var stream = require('stream');
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
  this._shards = {};
}

inherits(RAMStorageAdapter, StorageAdapter);

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
RAMStorageAdapter.prototype._get = function(key, callback) {
  var self = this;
  var result = this._items[key];

  if (!result) {
    return callback(new Error('Shard data not found'));
  }

  if (this._shards[key]) {
    result.shard = new stream.Readable({
      read: function() {
        if (this._finished) {
          this.push(null);
        } else {
          this.push(self._shards[key]);
        }
      }
    });
  } else {
    result.shard = new stream.Writable({
      write: function(data, encoding, next) {
        self._shards[key] = data;
        next();
      }
    });
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
