'use strict';

var async = require('async');
var inherits = require('util').inherits;
var path = require('path');
var fs = require('fs');
var StorageAdapter = require('../adapter');
var StorageItem = require('../item');

var HOME_DIR = process.platform === 'win32' ?
               process.env.USERPROFILE :
               process.env.HOME;

/*
Example Directory Tree
======================
  |- <datadir>/
  | |- shards/
  | | |- <shard_hash>/
  | | | |- contracts/
  | | | | |- renter_or_farmer_id_1
  | | | | |- renter_or_farmer_id_2
  | | | |- trees/
  | | | | |- renter_or_farmer_id_1
  | | | | |- renter_or_farmer_id_1
  | | | |- challenges/
  | | | | |- farmer_id_1
  | | | | |- farmer_id_2
  | | | |- meta/
  | | | | |- renter_or_farmer_id_1
  | | | | |- renter_or_farmer_id_1
  | | | |- shard.data
*/

/**
 * Implements a file-system based storage adapter
 * @constructor
 * @extends {StorageAdapter}
 * @param {String} datadir - Directory path to store data
 */
function FSStorageAdapter(datadir) {
  if (!(this instanceof FSStorageAdapter)) {
    return new FSStorageAdapter(datadir);
  }

  this._datadir = datadir || path.join(HOME_DIR, '.storjnode');
  this._sharddir = path.join(this._datadir, 'shards');

  if (!fs.existsSync(this._datadir)) {
    fs.mkdirSync(this._datadir);
  }

  if (!fs.existsSync(this._sharddir)) {
    fs.mkdirSync(this._sharddir);
  }
}

inherits(FSStorageAdapter, StorageAdapter);

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
FSStorageAdapter.prototype._get = function(key, callback) {
  var self = this;
  var target = path.join(this._sharddir, key);
  var contracts = path.join(target, 'contracts');
  var trees = path.join(target, 'trees');
  var challenges = path.join(target, 'challenges');
  var meta = path.join(target, 'meta');
  var data = {
    hash: key,
    shard: null,
    contracts: null,
    trees: null,
    challenges: null,
    meta: null
  };

  function checkTarget(done) {
    fs.exists(target, function(exists) {
      if (exists) {
        return done();
      }

      done(new Error('Shard data not found'));
    });
  }

  function getShard(done) {
    var shardpath = path.join(target, 'shard.data');

    fs.exists(shardpath, function(exists) {
      if (exists) {
        data.shard = fs.createReadStream(shardpath);
      } else {
        data.shard = fs.createWriteStream(shardpath);
      }

      done();
    });
  }

  function getItemData(done) {
    async.parallel([
      function getContracts(done) {
        self.__fromDirectory(contracts, function(err, result) {
          data.contracts = result;

          if (err) {
            done(new Error('Failed to load the shard contracts'));
          }

          done();
        });
      },
      function getTrees(done) {
        self.__fromDirectory(trees, function(err, result) {
          data.trees = result;

          if (err) {
            done(new Error('Failed to load the shard audit trees'));
          }

          done();
        });
      },
      function getChallenges(done) {
        self.__fromDirectory(challenges, function(err, result) {
          data.challenges = result;

          if (err) {
            done(new Error('Failed to load the shard audit challenges'));
          }

          done();
        });
      },
      function getMeta(done) {
        self.__fromDirectory(meta, function(err, result) {
          data.meta = result;

          if (err) {
            done(new Error('Failed to load the shard metadata'));
          }

          done();
        });
      }
    ], done);
  }

  async.series([checkTarget, getShard, getItemData], function(err) {
    if (err) {
      return callback(err);
    }

    callback(null, new StorageItem(data));
  });
};

/**
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {StorageItem} item
 * @param {Function} callback
 */
FSStorageAdapter.prototype._put = function(key, item, callback) {
  var self = this;
  var target = path.join(this._sharddir, key);
  var contracts = path.join(target, 'contracts');
  var trees = path.join(target, 'trees');
  var challenges = path.join(target, 'challenges');
  var meta = path.join(target, 'meta');
  var directories = [target, contracts, trees, challenges, meta];

  function checkTarget(done) {
    async.eachSeries(directories, function(dirname, next) {
      fs.exists(dirname, function(exists) {
        if (exists) {
          return next();
        }

        fs.mkdir(dirname, function(err) {
          if (err) {
            return next(err);
          }

          next();
        });
      });
    }, done);
  }

  function writeItemData(done) {
    async.parallel([
      function writeContracts(done) {
        self.__toDirectory(contracts, item.contracts, done);
      },
      function writeTrees(done) {
        self.__toDirectory(trees, item.trees, done);
      },
      function writeChallenges(done) {
        self.__toDirectory(challenges, item.challenges, done);
      },
      function writeMeta(done) {
        self.__toDirectory(meta, item.meta, done);
      }
    ], done);
  }

  async.series([checkTarget, writeItemData], function(err) {
    if (err) {
      return callback(new Error('Failed to write shard data'));
    }

    callback(null);
  });
};

/**
 * Loads the directory contents as an object where key is the file's basename
 * and value is the parsed JSON object
 * @private
 * @param {String} dirname
 * @param {Function} callback
 */
FSStorageAdapter.prototype.__fromDirectory = function(dirname, callback) {
  var result = {};

  function onComplete(err) {
    if (err) {
      return callback(err);
    }

    callback(null, result);
  }

  function loadFile(filename, done) {
    fs.readFile(path.join(dirname, filename), function(err, buffer) {
      if (err) {
        return done(err);
      }

      try {
        result[path.basename(filename)] = JSON.parse(buffer.toString('utf8'));
      } catch (err) {
        return done(err);
      }

      done();
    });
  }

  fs.readdir(dirname, function(err, contents) {
    if (err) {
      return callback(err);
    }

    async.each(contents, loadFile, onComplete);
  });
};

/**
 * Writes the data object to the supplied directory
 * @private
 * @param {String} dirname
 * @param {Object} data
 * @param {Function} callback
 */
FSStorageAdapter.prototype.__toDirectory = function(dirname, data, callback) {
  var filenames = Object.keys(data);

  function writeFile(filename, next) {
    var buffer;

    try {
      buffer = new Buffer(JSON.stringify(data[filename]));
    } catch (err) {
      return next(err);
    }

    fs.writeFile(path.join(dirname, filename), buffer, next);
  }

  async.each(filenames, writeFile, callback);
};

module.exports = FSStorageAdapter;
