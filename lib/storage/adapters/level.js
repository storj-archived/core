'use strict';

var inherits = require('util').inherits;
var StorageAdapter = require('../adapter');
var StorageItem = require('../item');
var levelup = require('levelup');
var FileStore = require('level-store');
var patchWriteStream = require('level-ws');

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

  // NB: `patchWriteStream` is used to bring back write streams to levelup
  // NB: https://github.com/Level/levelup#what-happened-to-dbcreatewritestream
  this._db = patchWriteStream(levelup(path, backend ? { db: backend } : {}));
  this._fs = FileStore(this._db);
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

  this._db.get(key + '.info', function(err, value) {
    if (err) {
      return callback(err);
    }

    var result = new StorageItem(JSON.parse(value));

    self._fs.exists(key + '.data', function(err, exists) {
      if (err) {
        return callback(err);
      }

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
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {StorageItem} item
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._put = function(key, item, callback) {
  // NB: Don't store any shard data here
  item.shard = null;

  this._db.put(key + '.info', JSON.stringify(item), function(err) {
    if (err) {
      return callback(err);
    }

    callback(null);
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
