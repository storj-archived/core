'use strict';

var assert = require('assert');
var StorageAdapter = require('./adapter');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var StorageItem = require('./item');
var WritableStream = require('readable-stream').Writable;

/**
 * Migrates data stored with one {@link StorageAdapter} to another
 * @constructor
 * @license AGPL-3.0
 * @param {StorageAdapter} source - The source adapter
 * @param {StorageAdapter} target - The migration destination
 */
function StorageMigration(source, target) {
  if (!(this instanceof StorageMigration)) {
    return new StorageMigration(source, target);
  }

  assert(source instanceof StorageAdapter, 'Invalid storage adapter supplied');
  assert(target instanceof StorageAdapter, 'Invalid storage adapter supplied');

  this.source = source;
  this.target = target;
  this.readyState = StorageMigration.STOPPED;
  this._isReady = false;

  EventEmitter.call(this);
}

inherits(StorageMigration, EventEmitter);

StorageMigration.STOPPED = 0;
StorageMigration.STARTED = 1;

/**
 * Starts the migration process
 */
StorageMigration.prototype.start = function() {
  var self = this;

  assert(
    this.readyState === StorageMigration.STOPPED,
    'Migration has already started'
  );

  self.readyState = StorageMigration.STARTED;
  self._sourceStream = self.source.createReadStream();
  self._targetStream = new WritableStream({
    write: self._handleSourceObject.bind(self),
    objectMode: true
  });

  self._targetStream.on('finish', self._handleSourceFinished.bind(self));
  self._sourceStream.on('error', self._handleSourceError.bind(self));
  self._targetStream.on('error', self._handleSourceError.bind(self));

  return self._sourceStream.pipe(self._targetStream);
};

/**
 * Stops the migration process
 */
StorageMigration.prototype.stop = function() {
  assert(
    this.readyState === StorageMigration.STARTED,
    'Migration has already stopped'
  );

  this._sourceStream.removeAllListeners();

  this.readyState = StorageMigration.STOPPED;
  this._sourceStream = null;
};

/**
 * Handles a data event from the source read stream and inserts it into the
 * the target adapter
 * @private
 * @param {StorageItem} sourceItem - Storage item from the source read stream
 */
StorageMigration.prototype._handleSourceObject = function(sourceItem, enc, cb) {
  var self = this;

  self.target.put(StorageItem(sourceItem), function(err) {
    if (err) {
      return cb(err);
    }

    self.target.get(sourceItem.hash, function(err, targetItem) {
      if (err) {
        return cb(err);
      }

      self.source.get(sourceItem.hash, function(err, fullSourceItem) {
        if (err) {
          return cb(err);
        }

        if (typeof fullSourceItem.shard.read === 'function') {
          return fullSourceItem.shard.pipe(targetItem.shard)
            .on('error', cb)
            .on('finish', cb);
        }

        cb();
      });
    });
  });
};

/**
 * Handles the completion of the source stream read
 * @private
 */
StorageMigration.prototype._handleSourceFinished = function() {
  this.readyState = StorageMigration.STOPPED;
  this._sourceStream = null;

  this.emit('finish');
};

/**
 * Handles errors received from the underyling source stream
 * @private
 * @param {Error} error
 */
StorageMigration.prototype._handleSourceError = function(err) {
  this.readyState = StorageMigration.STOPPED;
  this._sourceStream = null;

  this.emit('error', err);
};

module.exports = StorageMigration;
