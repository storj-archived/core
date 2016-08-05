'use strict';

var inherits = require('util').inherits;
var StorageAdapter = require('../../adapter');
var StorageItem = require('../../item');
var levelup = require('levelup');
var LevelDBFileStore = require('./filestore');
var merge = require('merge');

/**
 * Implements a HyperLevelDB storage adapter interface
 * @extends {StorageAdapter}
 * @param {String} path - Path to store the level db
 * @param {Function} backend - Optional backend override for levelup
 * @constructor
 * @license AGPL-3.0
 */
function LevelDBStorageAdapter(path, backend) {
  if (!(this instanceof LevelDBStorageAdapter)) {
    return new LevelDBStorageAdapter(path, backend);
  }

  this._db = levelup(path, {
    db: backend || LevelDBStorageAdapter.DEFAULT_BACKEND
  });
  this._fs = new LevelDBFileStore(this._db);
  this._isUsingDefaultBackend = !backend;
  this._path = path;
  this._isOpen = true;
}

LevelDBStorageAdapter.DEFAULT_BACKEND = require('leveldown-hyper');
LevelDBStorageAdapter.SIZE_START_KEY = '0';
LevelDBStorageAdapter.SIZE_END_KEY = 'z';

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
  if (!this._isUsingDefaultBackend) {
    // NB: We can't calculate for every possible backend, so return 0 and
    // NB: let implementors extend this class to provide the real value.
    return callback(null, 0);
  }

  this._db.db.approximateSize(
    LevelDBStorageAdapter.SIZE_START_KEY,
    LevelDBStorageAdapter.SIZE_END_KEY,
    callback
  );
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

/**
 * Implements the abstract {@link StorageAdapter#_open}
 * @private
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._open = function(callback) {
  var self = this;

  if (!this._isOpen) {
    return this._db.open(function(err) {
      if (err) {
        return callback(err);
      }

      self._isOpen = true;
      callback(null);
    });
  }

  callback(null);
};

/**
 * Implements the abstract {@link StorageAdapter#_close}
 * @private
 * @param {Function} callback
 */
LevelDBStorageAdapter.prototype._close = function(callback) {
  var self = this;

  if (this._isOpen) {
    return this._db.close(function(err) {
      if (err) {
        return callback(err);
      }

      self._isOpen = false;
      callback(null);
    });
  }

  callback(null);
};

module.exports = LevelDBStorageAdapter;
