'use strict';

var inherits = require('util').inherits;
var assert = require('assert');
var stream = require('readable-stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var merge = require('merge');
var utils = require('../utils');

/**
 * Takes a single file read stream and outputs several output streams, used for
 * "shredding" a file and creating muliple out destination interfaces
 * @constructor
 * @license LGPL-3.0
 * @param {String} filePath - Path the file to demultiplex
 * @param {Object} options
 * @param {Number} options.shardSize - Size of each shard
 * @fires FileDemuxer#shard
 */
function FileDemuxer(filePath, options) {
  if (!(this instanceof FileDemuxer)) {
    return new FileDemuxer(filePath, options);
  }

  assert(utils.existsSync(filePath), 'File does not exist at the supplied path');

  options = merge(Object.create(FileDemuxer.DEFAULTS), options);

  this._fileSize = fs.statSync(filePath).size;
  this._filePosition = 0;
  this._shardSize = options.shardSize;
  this._source = fs.createReadStream(filePath);
  this._currentShardIndex = 0;

  EventEmitter.call(this);
  setImmediate(this._openStream.bind(this));
}

FileDemuxer.SHARD_MULTIPLES_BACK = 5;
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
FileDemuxer.prototype._openStream = function() {
  if (this._fileSize === 0) {
    this._currentOutput = new stream.Readable({ read: utils.noop });
    return this.emit('error', new Error('File size cannot be 0 Bytes.'));
  }

  this._source.on('data', this._handleSourceBytes.bind(this));
  this._source.on('end', this._handleSourceEnded.bind(this));
};

/**
 * Handles incoming data from the source stream
 * @private
 */
FileDemuxer.prototype._handleSourceBytes = function(chunk) {
  if (!this._currentOutput) {
    this._currentOutput = new stream.Readable({ read: utils.noop });

    this.emit('shard', this._currentOutput, this._currentShardIndex);
  }

  if (this._needsNewOutputStream()) {
    this._closeCurrentOutput();

    this._currentOutput = new stream.Readable({ read: utils.noop });

    this.emit('shard', this._currentOutput, ++this._currentShardIndex);
  }

  setImmediate(this._pushBytesToOutput.bind(this, chunk));
};

/**
 * Closes the current output source and emits a finish event
 * @private
 */
FileDemuxer.prototype._handleSourceEnded = function() {
  this._closeCurrentOutput();
  this.emit('finish');
};

/**
 * Simply pushes the given bytes to the current output
 * @private
 */
FileDemuxer.prototype._pushBytesToOutput = function(bytes) {
  if (bytes) {
    this._filePosition += bytes.length;
  }

  this._currentOutput.push(bytes);
};

/**
 * Simply closes the output stream
 * @private
 */
FileDemuxer.prototype._closeCurrentOutput = function() {
  this._pushBytesToOutput(null);
};

/**
 * Returns a boolean indicating if we should create a new shard stream
 * @private
 */
FileDemuxer.prototype._needsNewOutputStream = function() {
  var expectedIndex = Math.floor(this._filePosition / this._shardSize);

  return this._currentShardIndex < expectedIndex;
};

/**
 * Determine the optimal shard size given an arbitrary file size in bytes
 * @param {Number} fileSize - The number of bytes in the given file
 * @param {Number} [acc=1] - Accumulator (number of recursions)
 * @returns {Number} shardSize
 */
FileDemuxer.getOptimalShardSize = function(fileSize, acc) {
  var accumulator = typeof acc === 'undefined' ? 0 : acc;
  var byteMultiple = (8 * (1024 * 1024)) * Math.pow(2, accumulator);
  var check = fileSize / byteMultiple;

  if (check > 0 && check < 2) {
    var distance = (accumulator - FileDemuxer.SHARD_MULTIPLES_BACK) < 0 ?
                   0 :
                   accumulator - FileDemuxer.SHARD_MULTIPLES_BACK;

    return (8 * (1024 * 1024)) * Math.pow(2, distance);
  }

  return this.getOptimalShardSize(fileSize, ++accumulator);
};

module.exports = FileDemuxer;
