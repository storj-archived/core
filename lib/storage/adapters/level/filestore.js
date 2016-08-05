'use strict';

var stream = require('readable-stream');

/**
 * Exposes an file read/write stream interface in/out of levelup
 * @constructor
 * @license AGPL-3.0
 * @param {Object} db - Levelup database instance
 */
function LevelDBFileStore(db) {
  if (!(this instanceof LevelDBFileStore)) {
    return new LevelDBFileStore(db);
  }

  this._db = db;
}

/**
 * Determines if the file is already stored in the db
 * @param {String} key - The key for the file stored
 * @param {Function} callback - Called with boolean indicating existence
 */
LevelDBFileStore.prototype.exists = function(key, callback) {
  this._db.get(key + ' 0', function(err) {
    callback(!err);
  });
};

/**
 * Deletes the file pieces from the database
 * @param {String} key - The key for the file stored
 * @param {Function} callback - Called with boolean indicating existence
 */
LevelDBFileStore.prototype.reset = function(key, callback) {
  var self = this;
  var index = 0;

  function _del(index, callback) {
    var itemkey = key + ' ' + index.toString();

    self._db.get(itemkey, function(err) {
      index++;

      if (!err) {
        self._db.del(itemkey, function() {
          _del(index, callback);
        });
      } else {
        callback();
      }
    });
  }

  _del(index, callback);
};

/**
 * Returns a readable stream of the file at the given key
 * @param {String} key - The key for the file to read
 * @returns {ReadableStream}
 */
LevelDBFileStore.prototype.createReadStream = function(key) {
  var self = this;
  var index = 0;

  return new stream.Readable({
    read: function() {
      var rs = this;

      self._db.get(key + ' ' + index.toString(), {
        valueEncoding: 'binary'
      }, function(err, result) {
        if (err) {
          if (err.type === 'NotFoundError') {
            return rs.push(null);
          } else {
            return rs.emit('error', err);
          }
        }

        index++;
        rs.push(Buffer(result, 'binary'));
      });
    }
  });
};

/**
 * Returns a writable stream for a file at the given key
 * @param {String} key - The key for the file to read
 * @returns {WritableStream}
 */
LevelDBFileStore.prototype.createWriteStream = function(key) {
  var self = this;
  var index = 0;

  return new stream.Writable({
    write: function(bytes, encoding, callback) {
      var ws = this;

      self._db.put(key + ' ' + index.toString(), bytes, {
        valueEncoding: 'binary'
      }, function(err) {
        if (err) {
          return ws.emit('error', err);
        }

        index++;
        callback();
      });
    }
  });
};

module.exports = LevelDBFileStore;
