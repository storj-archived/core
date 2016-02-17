'use strict';

var assert = require('assert');
var async = require('async');
var path = require('path');
var fs = require('fs');
var storage = require('kad').storage;
var Shard = require('./');

/**
 * Provides an interface for managing shards
 * @constructor
 * @param {String} datadir - Directory path for data shards/audits
 */
function ShardManager(datadir) {
  if (!(this instanceof ShardManager)) {
    return new ShardManager(datadir);
  }

  assert(fs.existsSync(path.dirname(datadir)), 'Storage path does not exist');

  this._path = datadir;
  this._store = new storage.FS(this._path);
}

/**
 * Stores the shard
 * @param {Shard} shard
 * @param {Function} callback
 */
ShardManager.prototype.add = function(shard, callback) {
  assert(shard instanceof Shard, 'Invalid shard object supplied');

  var self = this;
  var data = [[shard.getHash(), 'data'].join('.'), shard.getData()];
  var tree = [[shard.getHash(), 'tree'].join('.'), shard.getTree()];

  async.each([data, tree], function(pair, done) {
    self._store.put(pair[0], pair[1], done);
  }, callback);
};

/**
 * Removes the shard
 * @param {String} shard_hash
 * @param {Function} callback
 */
ShardManager.prototype.remove = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');

  var self = this;
  var keys = [[shard_hash, 'data'].join('.'), [shard_hash, 'tree'].join('.')];

  async.each(keys, self._store.del.bind(self._store), callback);
};

/**
 * Loads the shard
 * @param {String} shard_hash
 * @param {Function} callback
 */
ShardManager.prototype.load = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');

  var self = this;
  var keys = [[shard_hash, 'data'].join('.'), [shard_hash, 'tree'].join('.')];

  async.map(keys, self._store.get.bind(self._store), function(err, results) {
    if (err) {
      return callback(err);
    }

    if (!results[0] || !results[1]) {
      return callback(new Error('Shard data not found'));
    }

    var data = new Buffer(results[0], 'hex');
    var tree = JSON.parse(results[1]);

    callback(null, new Shard(data, tree));
  });
};

module.exports = ShardManager;
