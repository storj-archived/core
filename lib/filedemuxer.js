'use strict';

var inherits = require('util').inherits;
var assert = require('assert');
var stream = require('readable-stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var merge = require('merge');

/**
 * Takes a single file read stream and outputs several output streams, used for
 * "shredding" a file and creating muliple out destination interfaces
 * @constructor
 * @param {String} filePath - Path the file to demultiplex
 * @param {Object} options
 * @param {Number} options.shardSize - Size of each shard
 * @fires FileDemuxer#shard
 */
function FileDemuxer(filePath, options) {
  if (!(this instanceof FileDemuxer)) {
    return new FileDemuxer(filePath, options);
  }

  assert(fs.existsSync(filePath), 'File does not exist at the supplied path');

  options = merge(Object.create(FileDemuxer.DEFAULTS), options);

  this._fileSize = fs.statSync(filePath).size;
  this._filePosition = 0;
  this._shardSize = options.shardSize;
  this._source = fs.createReadStream(filePath);
  this._currentShardIndex = 0;

  EventEmitter.call(this);
  setImmediate(this._openStream.bind(this));
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
FileDemuxer.prototype._openStream = function() {
  this._source.on('data', this._handleSourceBytes.bind(this));
  this._source.on('end', this._handleSourceEnded.bind(this));
};

/**
 * Handles incoming data from the source stream
 * @private
 */
FileDemuxer.prototype._handleSourceBytes = function(chunk) {
  console.log('got %s bytes from source', chunk.length)

  if (!this._currentOutput) {
    console.log('no output yet, creating first...')

    this._currentOutput = new stream.Readable({
      read: function noop() {}
    });

    console.log('emitting shard stream %s', this._currentShardIndex)

    this.emit('shard', this._currentOutput, this._currentShardIndex);
  }

  if (this._needsNewOutputStream()) {
    console.log('needs a new output stream, closing last...')

    this._closeCurrentOutput();

    this._currentOutput = new stream.Readable({
      read: function noop() {}
    });

    console.log('emitting shard stream %s', this._currentShardIndex + 1)

    this.emit('shard', this._currentOutput, ++this._currentShardIndex);
  }

  setImmediate(this._pushBytesToOutput.bind(this, chunk));
};

/**
 * Closes the current output source and emits a finish event
 * @private
 */
FileDemuxer.prototype._handleSourceEnded = function() {
  console.log('source ended, closing and emitting finish')

  this._closeCurrentOutput();
  this.emit('finish');
};

/**
 * Simply pushes the given bytes to the current output
 * @private
 */
FileDemuxer.prototype._pushBytesToOutput = function(bytes) {
  if (bytes) {
    console.log('pushing %s bytes to output', bytes.length)

    this._filePosition += bytes.length;
  }

  this._currentOutput.push(bytes);
};

/**
 * Simply closes the output stream
 * @private
 */
FileDemuxer.prototype._closeCurrentOutput = function() {
  console.log('closing the current output stream')

  this._pushBytesToOutput(null);
};

/**
 * Returns a boolean indicating if we should create a new shard stream
 * @private
 */
FileDemuxer.prototype._needsNewOutputStream = function() {
  var expectedIndex = Math.floor(this._filePosition / this._shardSize);

  if (expectedIndex === -1) {
    expectedIndex = 0;
  }

  console.log('expected shard stream index %s, actual %s', expectedIndex, this._currentShardIndex)

  return this._currentShardIndex < expectedIndex;
};

module.exports = FileDemuxer;
