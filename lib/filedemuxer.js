'use strict';

var inherits = require('util').inherits;
var assert = require('assert');
var stream = require('readable-stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

/**
 * Takes a single file read stream and outputs several output streams, used for
 * "shredding" a file and creating muliple out destination interfaces
 * @constructor
 * @param {String} filePath - Path the file to demultiplex
 * @fires FileDemuxer#shard
 */
function FileDemuxer(filePath) {
  if (!(this instanceof FileDemuxer)) {
    return new FileDemuxer(filePath);
  }

  assert(fs.existsSync(filePath), 'File does not exist at the supplied path');

  this._filePath = filePath;
  this._fileSize = fs.statSync(filePath).size;
  this._filePosition = 0;
  this._shardSize = FileDemuxer.DEFAULTS.shardSize;
  this._shardPosition = 0;
  this._source = fs.createReadStream(this._filePath).pause();
  this._currentShardIndex = 0;

  EventEmitter.call(this);
  this._createNextShard();
}

FileDemuxer.DEFAULTS = {
  shardSize: 1024 * 1024 * 8
};

/**
 * Triggered when the demuxer has a shard ready to stream
 * @event FileDemuxer#shard
 * @param {ReadableStream} shard - The file shard as a readable stream
 */

 /**
  * Triggered when the demuxer has finished writing to all shards
  * @event FileDemuxer#finish
  */

inherits(FileDemuxer, EventEmitter);

/**
 * Opens the underyling readable stream
 * @private
 */
FileDemuxer.prototype._createNextShard = function() {
  var self = this;

  this._currentOutput = new stream.Readable({
    read: this._onShardRead.bind(this)
  });

  setImmediate(function() {
    self.emit('shard', self._currentOutput, self._currentShardIndex++);
  });

  return this;
};

/**
 * Handles data event from underyling source
 * @private
 */
FileDemuxer.prototype._onShardRead = function() {
  var bytesLeftInFile = this._fileSize - this._filePosition;
  var bytesLeftInShard = this._shardSize - this._shardPosition;
  var nextBytes = this._source.read(bytesLeftInShard);

  if (bytesLeftInFile && nextBytes === null) {
    return setImmediate(this._onShardRead.bind(this));
  }

  if (bytesLeftInShard >= bytesLeftInFile) {
    this._closeFinalShard(nextBytes);
  } else {
    this._pushToCurrentShard(nextBytes);
    this._checkShardPosition();
  }
};

/**
 * Pushes the supplied bytes to the current output stream
 * @private
 */
FileDemuxer.prototype._pushToCurrentShard = function(nextBytes) {
  this._currentOutput.push(nextBytes);

  this._filePosition += nextBytes.length;
  this._shardPosition += nextBytes.length;
};

/**
 * Pushes the supplied bytes to the current output stream and backfills zeroes
 * @private
 */
FileDemuxer.prototype._closeFinalShard = function(nextBytes) {
  var self = this;

  function finish() {
    self._currentOutput.push(null);
    self.emit('finish');
  }

  if (nextBytes === null) {
    return finish();
  }

  this._currentOutput.push(nextBytes);

  this._currentOutput.push(
    Buffer(this._shardSize - nextBytes.length).fill(null)
  );

  this._filePosition = this._fileSize;
  this._shardPosition = this._shardSize;

  finish();
};

/**
 * Check if a new shard should be created
 * @private
 */
FileDemuxer.prototype._checkShardPosition = function() {
  if (this._shardSize === this._shardPosition) {
    this._shardPosition = 0;
    this._currentOutput.push(null);
    this._createNextShard();
  }
};

module.exports = FileDemuxer;
