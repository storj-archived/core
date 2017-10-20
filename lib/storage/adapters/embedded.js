'use strict';

var inherits = require('util').inherits;
var StorageAdapter = require('../adapter');
var levelup = require('levelup');
var leveldown = require('leveldown');
var kfs = require('kfs');
var path = require('path');
var assert = require('assert');
var utils = require('../../utils');
var mkdirp = require('mkdirp');

/**
 * Implements an LevelDB/KFS storage adapter interface
 * @extends {StorageAdapter}
 * @param {String} storageDirPath - Path to store the level db
 * @constructor
 * @license AGPL-3.0
 */
function EmbeddedStorageAdapter(storageDirPath) {
  if (!(this instanceof EmbeddedStorageAdapter)) {
    return new EmbeddedStorageAdapter(storageDirPath);
  }

  this._validatePath(storageDirPath);

  this._path = storageDirPath;
  this._db = levelup(leveldown(path.join(this._path, 'contracts.db')), {
    maxOpenFiles: EmbeddedStorageAdapter.MAX_OPEN_FILES
  });
  this._fs = kfs(path.join(this._path, 'sharddata.kfs'));
  this._isOpen = true;
}

EmbeddedStorageAdapter.SIZE_START_KEY = '0';
EmbeddedStorageAdapter.SIZE_END_KEY = 'z';
EmbeddedStorageAdapter.MAX_OPEN_FILES = 1000;

inherits(EmbeddedStorageAdapter, StorageAdapter);

/**
 * Validates the storage path supplied
 * @private
 */
EmbeddedStorageAdapter.prototype._validatePath = function(storageDirPath) {
  if (!utils.existsSync(storageDirPath)) {
    mkdirp.sync(storageDirPath);
  }

  assert(utils.isDirectory(storageDirPath), 'Invalid directory path supplied');
};

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._get = function(key, callback) {
  var self = this;

  this._db.get(key, { fillCache: false }, function(err, value) {
    if (err) {
      return callback(err);
    }

    var result = JSON.parse(value);
    var fskey = result.fskey || key;

    self._fs.exists(fskey, function(err, exists) {
      if (err) {
        return callback(err);
      }

      function _getShardStreamPointer(callback) {
        var getStream = exists ?
                        self._fs.createReadStream.bind(self._fs) :
                        self._fs.createWriteStream.bind(self._fs);
        if (!exists) {
          fskey = utils.rmd160(key, 'hex');
          result.fskey = fskey;
        }
        getStream(fskey, function(err, stream) {
          if (err) {
            return callback(err);
          }

          result.shard = stream;

          callback(null, result);
        });
      }

      _getShardStreamPointer(callback);
    });
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_peek}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._peek = function(key, callback) {
  this._db.get(key, { fillCache: false }, function(err, value) {
    if (err) {
      return callback(err);
    }

    callback(null, JSON.parse(value));
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {Object} item
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._put = function(key, item, callback) {
  var self = this;

  item.shard = null; // NB: Don't store any shard data here

  item.fskey = utils.rmd160(key, 'hex');

  self._db.put(key, JSON.stringify(item), {
    sync: true
  }, function(err) {
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
EmbeddedStorageAdapter.prototype._del = function(key, callback) {
  var self = this;
  var fskey = key;

  self._peek(key, function(err, item) {
    if (!err && item.fskey) {
      fskey = item.fskey;
    }

    self._db.del(key, function(err) {
      if (err) {
        return callback(err);
      }

      self._fs.unlink(fskey, function(err) {
        if (err) {
          return callback(err);
        }

        callback(null);
      });
    });
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_flush}
 * @private
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._flush = function(callback) {
  this._fs.flush(callback);
};

/**
 * Implements the abstract {@link StorageAdapter#_size}
 * @private
 * @param {String} [key]
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._size = function(key, callback) {
  var self = this;

  if (typeof key === 'function') {
    callback = key;
    key = null;
  }

  this._db.db.approximateSize(
    EmbeddedStorageAdapter.SIZE_START_KEY,
    EmbeddedStorageAdapter.SIZE_END_KEY,
    function(err, contractDbSize) {
      if (err) {
        return callback(err);
      }

      function handleStatResults(err, stats) {
        if (err) {
          return callback(err);
        }

        var kfsUsedSpace = stats.reduce(function(stat1, stat2) {
          return {
            sBucketStats: {
              size: stat1.sBucketStats.size + stat2.sBucketStats.size
            }
          };
        }, {
          sBucketStats: { size: 0 }
        }).sBucketStats.size;

        callback(null, kfsUsedSpace, contractDbSize);
      }

      /* istanbul ignore if */
      if (key) {
        self._fs.stat(utils.rmd160(key, 'hex'), handleStatResults);
      } else {
        self._fs.stat(handleStatResults);
      }
    }
  );
};

/**
 * Implements the abstract {@link StorageAdapter#_keys}
 * @private
 * @returns {ReadableStream}
 */
EmbeddedStorageAdapter.prototype._keys = function() {
  return this._db.createKeyStream();
};

/**
 * Implements the abstract {@link StorageAdapter#_open}
 * @private
 * @param {Function} callback
 */
EmbeddedStorageAdapter.prototype._open = function(callback) {
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
EmbeddedStorageAdapter.prototype._close = function(callback) {
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

module.exports = EmbeddedStorageAdapter;
