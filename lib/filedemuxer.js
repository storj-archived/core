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
  this._shardSize = FileDemuxer.DEFAULTS.shardSize > this._fileSize ? this._fileSize : FileDemuxer.DEFAULTS.shardSize;
  this._shardPosition = 0;
  this._source = fs.createReadStream(this._filePath);
  this._currentShardIndex = 0;
  this._numShardsRaw = this._fileSize/this._shardSize;
  this._numShardsRemainder = this._numShardsRaw % 1;
  this._numShardsFinalSize = this._fileSize % this._shardSize;
  this._numShardsWhole = this._numShardsRaw - this.numShardsRemainder;
  this._numShards = Math.ceil(this._numShardsRaw);

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
  self._shardPosition = 0;

  self._currentOutput = new stream.Readable({
    read: self._onShardRead.bind(self)
  });

  setImmediate(function() {
    console.log('emitting shard');
    self.emit('shard', self._currentOutput, self._currentShardIndex++);
  });

  return this;
};

/**
 * Handles data event from underyling source
 * @private
 */
FileDemuxer.prototype._onShardRead = function() {
  var self = this;
 // var nextBytes = this._source.read(bytesLeftInShard);

  this._source.once('data', function(chunk) {
    this.pause();
    var nextBytes = chunk;

    //if (bytesLeftInFile) {
    //  return setImmediate(this._onShardRead.bind(this));
    //}


    self._pushToCurrentShard(nextBytes);
    self._checkShardPosition();

  }).resume();
};

/**
 * Pushes the supplied bytes to the current output stream
 * @private
 */
FileDemuxer.prototype._pushToCurrentShard = function(nextBytes) {
  var self = this;

  //console.log('nextBytes', nextBytes);
  this._currentOutput.push(nextBytes);

  this._filePosition += nextBytes.length;
  this._shardPosition += nextBytes.length;
  //console.log('shardPosition: ', this._shardPosition);

  var bytesLeftInFile = self._fileSize - self._filePosition;
  var bytesLeftInShard = self._shardSize - self._shardPosition;

  console.log('SHARD ', self._currentShardIndex, 'totalShards: ', self._numShards, 'fileSize: ', self._fileSize, ' filePosition: ', self._filePosition, 'shardSize: ', self._shardSize, ' shardPosition: ', self._shardPosition, ' bytesLeftInFile: ', bytesLeftInFile, ' nextBytes.length: ', nextBytes.length, ' chunkLength: ', nextBytes.length);


  //console.log('bytesLeftInFile: ', bytesLeftInFile, ' bytesLeftInShard: ', bytesLeftInShard, ' currentShardIndex: ', self._currentShardIndex);
  //console.log('currentShardIndex: ', self._currentShardIndex, ' numShards: ', this._numShards, ' shardPosition: ', self._shardPosition, ' numShardsRemainder: ', self._numShardsRemainder, 'finalShardSize: ', this._numShardsFinalSize);

};

/**
 * Pushes the supplied bytes to the current output stream and backfills zeroes
 * @private
 */
FileDemuxer.prototype._closeFinalShard = function() {
  var self = this;

  function finish() {
    console.log('Pushing NULLLLLLLLL BIOTCH');
    self._currentOutput.push(null);
    self.emit('finish');
  }

  this._filePosition = this._fileSize;
  this._shardPosition = this._shardSize;

  finish();
};

/**
 * Check if a new shard should be created
 * @private
 */
FileDemuxer.prototype._checkShardPosition = function() {
  var self = this;

  // If we have multiple shards or a single shard that is exactly the size of one shard
  if ((this._shardSize === this._shardPosition) && (self._currentShardIndex < self._numShards)) {
    var bytesLeftInFile = self._fileSize - self._filePosition;
    var bytesLeftInShard = self._shardSize - self._shardPosition;

    //console.log('fileSize: ', this._fileSize, ' filePosition: ', self._filePosition, 'shardSize: ', this._shardSize, ' shardPosition: ', self._shardPosition);
    //console.log('bytesLeftInFile: ', bytesLeftInFile, ' bytesLeftInShard: ', bytesLeftInShard, ' currentShardIndex: ', self._currentShardIndex);
    //console.log('currentShardIndex: ', self._currentShardIndex, ' numShards: ', this._numShards, ' shardPosition: ', self._shardPosition, ' numShardsRemainder: ', self._numShardsRemainder, 'finalShardSize: ', this._numShardsFinalSize);
    console.log('Creating next shard!!!');
    this._createNextShard();
  }

  // If we have one shard and the file size is less than a whole shard
  //if ((( this._numShards === 1 ) && ( self._shardPosition === this._fileSize) ) || ((self._currentShardIndex + 1) === self._numShards) && ( self._shardPosition === self._numShardsFinalSize) ) {
  if ( this._fileSize === this._filePosition ) {
    console.log('Closing final shard!');
    self._closeFinalShard();
  }
};

module.exports = FileDemuxer;
