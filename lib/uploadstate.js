'use strict';

var fs = require('fs');
var crypto = require('crypto');
var FileDemuxer = require('./filedemuxer');

/**
 * Internal state machine used by {@link BridgeClient}
 * @constructor
 * @private
 * @param {String} id - Bucket ID for the upload state
 * @param {String} file - Path to the file to track
 * @param {Function} completionCallback - Reference to callback after complete
 */
function UploadState(id, file, completionCallback) {
  if (!(this instanceof UploadState)) {
    return new UploadState(file);
  }

  this.bucketId = id;
  this.file = file;
  this.cleanQueue = [];
  this.numShards = Math.ceil(
    fs.statSync(this.file).size / FileDemuxer.DEFAULTS.shardSize
  );
  this.completed = 0;
  this.hasher = crypto.createHash('sha256');
  this.callback = completionCallback;
}

/**
 * Unlinks the referenced tmp files
 * @private
 */
UploadState.prototype.cleanup = function() {
  this.cleanQueue.forEach(function(tmpFilePath) {
    fs.unlinkSync(tmpFilePath);
  });
};

module.exports = UploadState;
