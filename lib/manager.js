'use strict';

var constants = require('./constants');
var assert = require('assert');
var StorageAdapter = require('./storage/adapter');
var StorageItem = require('./storage/item');
var merge = require('merge');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

/**
 * Interface for managing contracts, shards, and audits
 * @constructor
 * @extends {EventEmitter}
 * @param {StorageAdapter} storage - Storage adapter to use
 * @param {Object} options
 * @param {Boolean} options.disableReaper - Don't perform periodic reaping of
 * stale contracts
 * @param {Number} options.maxCapacity - Max number of bytes to allow in storage
 */
function Manager(storage, options) {
  if (!(this instanceof Manager)) {
    return new Manager(storage, options);
  }

  assert(storage instanceof StorageAdapter, 'Invalid storage adapter');

  this._options = merge(Object.create(Manager.DEFAULTS), options);
  this._storage = storage;
  this._capacityReached = false;

  this._initShardReaper();
}

inherits(Manager, EventEmitter);

/**
 * Triggered when the underlying storage adapter reaches capacity
 * @event Manager#locked
 */

/**
 * Triggered when the underlying storage adapter has newly freed space
 * @event Manager#unlocked
 */

Manager.DEFAULTS = {
  disableReaper: false,
  maxCapacity: Infinity
};

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
  var self = this;

  assert(item instanceof StorageItem, 'Invalid storage item supplied');
  assert(typeof callback === 'function', 'Callback function must be supplied');

  if (this._capacityReached) {
    return callback(new Error('Storage capacity reached'));
  }

  this._storage.put(item, function(err) {
    if (err) {
      return callback(err);
    }

    self._checkCapacity();
    callback(null);
  });

};

/**
 * Enumerates all storage contracts and reaps stale data
 * @param {Function} callback - Called on complete
 */
Manager.prototype.clean = function(callback) {
  var self = this;
  var rstream = this._storage.createReadStream();

  rstream.on('data', function(item) {
    rstream.pause();

    var total = Object.keys(item.contracts).length;
    var endedOrIncomplete = 0;

    for (var nodeID in item.contracts) {
      var ended = item.contracts[nodeID].get('store_end') < Date.now();
      var incomplete = !item.contracts[nodeID].isComplete();

      if (ended || incomplete) {
        endedOrIncomplete++;
      }
    }

    if (total === endedOrIncomplete) {
      self._storage.del(item.hash, function(/* err */) {
        rstream.resume();
      });
    } else {
      rstream.resume();
    }
  });

  rstream.on('end', function() {
    self._checkCapacity();
    callback();
  });
};

/**
 * Checks the underlying storage adapter's size and determines if our defined
 * capacity has been reached
 * @private
 */
Manager.prototype._checkCapacity = function() {
  var self = this;

  this._storage.size(function(err, bytes) {
    if (err) {
      return self.emit('error', err);
    }

    var capacityReached = bytes >= self._options.maxCapacity;

    if (capacityReached !== self._capacityReached) {
      self.emit(capacityReached ? 'locked' : 'unlocked');
    }

    self._capacityReached = capacityReached;
  });
};

/**
 * Initialize the shard reaper to check for stale contracts and reap shards
 * @private
 */
Manager.prototype._initShardReaper = function() {
  var self = this;

  if (!this._options.disableReaper) {
    setTimeout(self._initShardReaper.bind(self), constants.CLEAN_INTERVAL);
  }
};

module.exports = Manager;
