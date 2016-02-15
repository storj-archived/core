'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
var storage = require('kad').storage;
var utils = require('../utils');
var Audit = require('./');

/**
 * Provides an interface for managing audits
 * @constructor
 * @param {String} datadir - Directory path for storage audit data
 */
function AuditManager(datadir) {
  if (!(this instanceof AuditManager)) {
    return new AuditManager(datadir);
  }

  assert(fs.existsSync(path.dirname(datadir)), 'Storage path does not exist');

  this._path = datadir;
  this._store = new storage.FS(this._path);
}

/**
 * Adds the private audit data to the manager
 * @param {Audit} audit
 * @param {Function} callback
 */
AuditManager.prototype.add = function(audit, callback) {
  assert(audit instanceof Audit, 'Invalid audit object supplied');
  this._store.put(
    utils.rmd160sha256(audit._shard),
    JSON.stringify(audit.getPrivateRecord()),
    callback
  );
};

/**
 * Removes the audit data from the manager
 * @param {String} shard_hash
 * @param {Function} callback
 */
AuditManager.prototype.remove = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');
  this._store.del(shard_hash, callback);
};

/**
 * Loads the next challenge from the audit data
 * @param {String} shard_hash
 * @param {Function} callback
 */
AuditManager.prototype.load = function(shard_hash, callback) {
  assert.ok(shard_hash, 'Invalid shard hash supplied');
  this._store.get(shard_hash, function(err, privateAuditRecord) {
    if (err) {
      return callback(err);
    }

    callback(null, JSON.parse(privateAuditRecord));
  });
};

module.exports = AuditManager;
