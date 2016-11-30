'use strict';

var async = require('async');
var utils = require('../utils');
var merge = require('merge');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var rimraf = require('rimraf');

/**
 * Internal state machine used by {@link BridgeClient}
 * @constructor
 * @license LGPL-3.0
 * @param {Object} options
 * @param {String} options.id - Bucket ID for the upload state
 * @param {String} options.file - Path to the file to track
 * @param {Number} options.numShards - The number of shards to transfer
 * @param {Number} options.concurrency - The number shards to transfer at once
 * @param {Function} options.worker - The queue task processor function
 * @param {Function} options.onComplete - Reference to callback after complete
 */
function UploadState(options) {
  /* jshint maxstatements: 16 */
  if (!(this instanceof UploadState)) {
    return new UploadState(options);
  }

  options = merge(Object.create(UploadState.DEFAULTS), options);

  this.bucketId = options.id;
  this.file = options.file;
  this.cleanQueue = [];
  this.numShards = options.numShards;
  this.completed = 0;
  this.callback = options.onComplete;
  this.concurrency = options.concurrency;
  this.queue = async.queue(options.worker, this.concurrency);
  this.killed = false;
  this.uploaders = [];

  EventEmitter.call(this);
  this.setMaxListeners(0);
}

inherits(UploadState, EventEmitter);

/**
 * Triggered when the upload queue has been killed
 * @event UploadState#killed
 */

UploadState.DEFAULTS = {
  concurrency: 6
};

/**
 * Unlinks the referenced tmp files
 */
UploadState.prototype.cleanup = function() {
  this.killed = true;

  this.cleanQueue.forEach(function(tmpFilePath) {
    if (utils.existsSync(tmpFilePath)) {
      rimraf.sync(tmpFilePath);
    }
  });

  this.uploaders.forEach(function(channel) {
    channel.end();
  });

  this.queue.kill();
  this.emit('killed');
  this.removeAllListeners();
};

module.exports = UploadState;
