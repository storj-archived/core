'use strict';

var assert = require('assert');
var StorageAdapter = require('./adapter');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var StorageItem = require('./item');

/**
 * Migrates data stored with one {@link StorageAdapter} to another
 * @constructor
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

  EventEmitter.call(this);
}

inherits(StorageMigration, EventEmitter);

StorageMigration.STOPPED = 0;
StorageMigration.STARTED = 1;

/**
 * Starts the migration process
 */
StorageMigration.prototype.start = function() {
  assert(
    this.readyState === StorageMigration.STOPPED,
    'Migration has already started'
  );

  this.readyState = StorageMigration.STARTED;
  this._sourceStream = this.source.createReadStream();

  this._sourceStream.on('data', this._handleSourceObject.bind(this));
  this._sourceStream.on('end', this._handleSourceFinished.bind(this));
  this._sourceStream.on('error', this._handleSourceError.bind(this));

  return this._sourceStream;
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
StorageMigration.prototype._handleSourceObject = function(sourceItem) {
  var self = this;

  self._sourceStream.pause();

  self.target.put(StorageItem(sourceItem), function(err) {
    if (err) {
      return self.emit('error', err);
    }

    self.target.get(sourceItem.hash, function(err, targetItem) {
      if (err) {
        return self.emit('error', err);
      }

      self.source.get(sourceItem.hash, function(err, fullSourceItem) {
        if (err) {
          return self.emit('error', err);
        }

        if (typeof fullSourceItem.shard.read === 'function') {
          return fullSourceItem.shard.pipe(targetItem.shard)
            .on('error', self._handleSourceError.bind(this))
            .on('finish', self._sourceStream.resume.bind(self._sourceStream));
        }

        self._sourceStream.resume();
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
