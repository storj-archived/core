'use strict';

var stream = require('readable-stream');
var assert = require('assert');
var Item = require('./item');
var Contract = require('../contract');

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
 * Calls the implemented {@link StorageAdapter#_peek} and validates the result
 * @param {String} key - Shard hash to get metadata for
 * @param {Function} callback - Called with error or {@link StorageItem}
 */
StorageAdapter.prototype.peek = function(key, callback) {
  assert(typeof key === 'string', 'Invalid key supplied');
  assert(key.length === 40, 'Key must be 160 bit hex string');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  return this._peek(key, callback);
};

/**
 * Calls the implemented {@link StorageAdapter#_put} and validates the input
 * @param {StorageItem} item - Item to write to storage
 * @param {Function} callback - Called on complete write
 */
StorageAdapter.prototype.put = function(item, callback) {
  assert(item instanceof Item, 'Invalid storage item supplied');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  for (var nodeID in item.contracts) {
    if (item.contracts[nodeID] instanceof Contract) {
      item.contracts[nodeID] = item.contracts[nodeID].toObject();
    }
  }

  item.updateTimestamp();

  return this._put(item.hash, item, callback);
};

/**
 * Calls the implemented {@link StorageAdapter#_del}
 * @param {String} key - Shard hash to delete the data for
 * @param {Function} callback - Called with error or {@link StorageItem}
 */
StorageAdapter.prototype.del = function(key, callback) {
  assert(typeof key === 'string', 'Invalid key supplied');
  assert(key.length === 40, 'Key must be 160 bit hex string');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  return this._del(key, callback);
};

/**
 * Calls the implemented {@link StorageAdapter#_size}
 * @param {Function} callback - Called with error or number of bytes stored
 */
StorageAdapter.prototype.size = function(callback) {
  assert(typeof callback === 'function', 'Callback function must be supplied');

  return this._size(callback);
};

/**
 * Calls the implemented {@link StorageAdapter#_keys} and returns a readable
 * stream containing each stored item
 * @return {ReadableStream}
 */
StorageAdapter.prototype.createReadStream = function() {
  var self = this;
  var keys = null;
  var current = 0;

  return new stream.Readable({
    objectMode: true,
    read: function() {
      var rstream = this;

      function handleError(err) {
        rstream.emit('error', err);
        rstream.push(null);
      }

      if (!keys) {
        return self._keys(function(err, result) {
          if (err) {
            return handleError(err);
          }

          keys = result;

          if (!keys[current]) {
            return rstream.push(null);
          }

          self.peek(keys[current], function(err, item) {
            if (err) {
              return handleError(err);
            }

            current++;
            rstream.push(item);
          });
        });
      }

      if (!keys[current]) {
        return rstream.push(null);
      }

      self.peek(keys[current], function(err, item) {
        if (err) {
          return handleError(err);
        }

        current++;
        rstream.push(item);
      });
    }
  });
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
 * Performs lookup and provides an {@link StorageItem} to the callback but does
 * not initialize any shard read/write stream
 * @abstract
 * @param {String} key - Shard hash
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._peek = function(/* key, callback */) {
  throw new Error('Method not implemented');
};

/**
 * Delete the shard data at the given key
 * @abstract
 * @param {String} key - Shard hash
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._del = function(/* key, callback */) {
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

/**
 * Returns the hashes of all shards stored
 * @abstract
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._keys = function(/* callback */) {
  throw new Error('Method not implemented');
};

/**
 * Returns the number of bytes stored
 * @abstract
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._size = function(/* callback */) {
  throw new Error('Method not implemented');
};

/**
 * Opens the storage adapter
 * @abstract
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._open = function(callback) {
  callback(null);
};

/**
 * Closes the storage adapter
 * @abstract
 * @param {Function} callback - Called on complete
 */
StorageAdapter.prototype._close = function(callback) {
  callback(null);
};

module.exports = StorageAdapter;
