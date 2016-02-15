'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var storage = require('kad').storage;
var Contract = require('./');

/**
 * Provides an interface for managing contracts
 * @constructor
 * @param {String} datadir - Directory path for storage contracts
 */
function ContractManager(datadir) {
  if (!(this instanceof ContractManager)) {
    return new ContractManager(datadir);
  }

  assert(fs.existsSync(path.dirname(datadir)), 'Storage path does not exist');

  this._path = datadir;
  this._store = new storage.FS(this._path);
}

/**
 * Adds the contract to the manager
 * @param {Contract} contract
 * @param {Function} callback
 */
ContractManager.prototype.add = function(contract, callback) {
  assert(contract instanceof Contract, 'Invalid contract object supplied');
  assert(contract.get('data_hash'), 'Contract missing data_hash');
  this._store.put(contract.get('data_hash'), contract.toJSON(), callback);
};

/**
 * Removes the contract from the manager
 * @param {String} shard_hash
 * @param {Function} callback
 */
ContractManager.prototype.remove = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');
  this._store.del(shard_hash, callback);
};

/**
 * Loads the contract from the manager
 * @param {String} shard_hash
 * @param {Function} callback
 */
ContractManager.prototype.load = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');
  this._store.get(shard_hash, function(err, contract) {
    if (err) {
      return callback(err);
    }

    callback(null, Contract.fromJSON(contract));
  });
};

module.exports = ContractManager;
