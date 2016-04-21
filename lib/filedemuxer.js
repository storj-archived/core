'use strict';

var inherits = require('util').inherits;
var assert = require('assert');
var stream = require('readable-stream');

/**
 * Takes a single input stream and outputs several output streams, used for
 * "shredding" a file and creating muliple out destination interfaces
 * @constructor
 * @param {Object} options
 * @param {Number} options.shards - Number of total shards to output
 * @param {Number} options.length - Number of total bytes of input
 * @fires FileDemuxer#shard
 */
function FileDemuxer(options) {
  if (!(this instanceof FileDemuxer)) {
    return new FileDemuxer(options);
  }

  this._checkOptions(options);

  this._shards = options.length % options.shards === 0 ?
                 options.shards :
                 options.shards - 1;
  this._length = options.length;
  this._shardsize = Math.floor(this._length / this._shards);
  this._remainder = this._length % this._shards;
  this._position = 0;
  this._shardpos = 0;
  this._streams = [];

  stream.Writable.call(this);
}

/**
 * Triggered when the demuxer has a shard ready to stream
 * @event FileDemuxer#shard
 * @param {ReadableStream} shard - The file shard as a readable stream
 */

inherits(FileDemuxer, stream.Writable);

/**
 * Checks the options supplied to the constructor
 * @private
 */
FileDemuxer.prototype._checkOptions = function(options) {
  var shards = options.shards;
  var length = options.length;

  assert(typeof shards === 'number', 'You must supply a shards parameter');
  assert(shards > 0, 'Cannot demux a 0 shard stream');
  assert(typeof length === 'number', 'You must supply a length parameter');
  assert(length > 0, 'Cannot demux a 0 length stream');
};

/**
 * Implements the underlying write method
 * @private
 * @param {Buffer} chunk
 * @param {String} encoding
 * @param {Function} next
 */
FileDemuxer.prototype._write = function(chunk, encoding, next) {
  if ((chunk.length + this._position) > this._length) {
    return this.emit('error', new Error('Write amount exceeds the length'));
  }

  var leftInCurrentShard = this._shardsize - this._shardpos;

  if (chunk.length <= leftInCurrentShard) {
    return this._writeSlice(chunk, next);
  }

  this._getCurrentOutput().push(chunk.slice(0, leftInCurrentShard));
  this._position += leftInCurrentShard;
  this._shardpos = 0;

  this._write(chunk.slice(leftInCurrentShard), encoding, next);
};

/**
 * Writes the given slice to the stream
 * @private
 */
FileDemuxer.prototype._writeSlice = function(chunk, next) {
  this._getCurrentOutput().push(chunk);
  this._shardpos += chunk.length;
  this._position += chunk.length;

  if ((this._position === this._length) && this._remainder) {
    this._getCurrentOutput().push(new Buffer(
      this._shardsize - this._remainder
    ).fill(null));
    this._getCurrentOutput().push(null);
  }

  return next();
};

/**
 * Returns the current output stream
 * @private
 * @param {Buffer} chunk
 * @param {String} encoding
 * @param {Function} next
 */
FileDemuxer.prototype._getCurrentOutput = function() {
  var current = this._streams[this._streams.length - 1];

  if (this._streams.length <= (this._position / this._shardsize)) {
    if (current) {
      current.push(null);
    }

    current = new stream.Readable({ read: function noop() {} });

    this._streams.push(current);
    this.emit('shard', current);
  }

  return current;
};

module.exports = FileDemuxer;
