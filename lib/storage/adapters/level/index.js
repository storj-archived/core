'use strict';

var inherits = require('util').inherits;
var StorageAdapter = require('../../adapter');
var StorageItem = require('../../item');
var levelup = require('levelup');
var LevelDBFileStore = require('./filestore');
var merge = require('merge');
var fs = require('fs');
var path = require('path');

/**
 * Implements an LevelDB storage adapter interface
 * @extends {StorageAdapter}
 * @param {String} path - Path to store the level db
 * @param {Function} backend - Optional backend override for levelup
 * @constructor
 */
function LevelDBStorageAdapter(path, backend) {
  if (!(this instanceof LevelDBStorageAdapter)) {
    return new LevelDBStorageAdapter(path, backend);
  }

  this._db = levelup(path, { db: backend });
  this._fs = new LevelDBFileStore(this._db);
  this._isUsingDefaultBackend = !backend;
  this._path = path;
}

inherits(LevelDBStorageAdapter, StorageAdapter);

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._get = function(key, callback) {
  var self = this;

  this._db.get(key + '.info', { fillCache: false }, function(err, value) {
    if (err) {
      return callback(err);
    }

    var result = new StorageItem(JSON.parse(value));

    self._fs.exists(key + '.data', function(exists) {
      if (exists) {
        result.shard = self._fs.createReadStream(key + '.data');
      } else {
        result.shard = self._fs.createWriteStream(key + '.data');
      }

      callback(null, result);
    });
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_peek}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._peek = function(key, callback) {
  this._db.get(key + '.info', { fillCache: false }, function(err, value) {
    if (err) {
      return callback(err);
    }

    callback(null, new StorageItem(JSON.parse(value)));
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {StorageItem} item
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._put = function(key, item, callback) {
  var self = this;

  item.shard = null; // NB: Don't store any shard data here

  this._db.get(key + '.info', { fillCache: false }, function(err, existing) {
    if (err) {
      existing = JSON.stringify({});
    }

    var plain = JSON.parse(JSON.stringify(item));
    var value = merge.recursive(JSON.parse(existing), plain);

    self._db.put(key + '.info', JSON.stringify(value), {
      sync: true
    }, function(err) {
      if (err) {
        return callback(err);
      }

      callback(null);
    });
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_del}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._del = function(key, callback) {
  var self = this;

  this._db.del(key + '.info', function(err) {
    if (err) {
      return callback(err);
    }

    self._fs.reset(key + '.data', function(err) {
      if (err) {
        return callback(err);
      }

      callback(null);
    });
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_size}
 * @private
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._size = function(callback) {
  var self = this;
  var size = 0;

  if (!this._isUsingDefaultBackend) {
    // NB: We can't calculate for every possible backend, so return 0 and
    // NB: let implementors extend this class to provide the real value.
    return callback(null, size);
  }

  // NB: This operation is actually synchronous, but given that LevelDB compacts
  // NB: files into levels, the cost of executing `stat` on just a handful of
  // NB: files should be negligble.
  try {
    size = fs.readdirSync(this._path).map(function(filePath) {
      return fs.statSync(path.join(self._path, filePath));
    }).reduce(function(statsA, statsB) {
      return { size: statsA.size + statsB.size };
    }, { size: 0 }).size;
  } catch (err) {
    return callback(err);
  }

  callback(null, size);
};

/**
 * Implements the abstract {@link StorageAdapter#_keys}
 * @private
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._keys = function(callback) {
  var keys = [];
  var stream = this._db.createKeyStream();

  stream.on('data', function(key) {
    var parts = key.split('.');
    var name = parts[0];
    var ext = parts[1];

    if (ext === 'info') {
      keys.push(name);
    }
  });

  stream.on('end', function() {
    callback(null, keys);
  });

  stream.on('error', callback);
};

module.exports = LevelDBStorageAdapter;
