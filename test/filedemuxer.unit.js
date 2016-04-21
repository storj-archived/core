'use strict';

var expect = require('chai').expect;
var FileDemuxer = require('../lib/filedemuxer');
var stream = require('readable-stream');
var noisegen = require('noisegen');

describe('FileDemuxer', function() {

  describe('@constructor', function() {

    it('should create an instance with the new keyword', function() {
      expect(new FileDemuxer({
        shards: 2,
        length: 10
      })).to.be.instanceOf(FileDemuxer);
      expect(new FileDemuxer({
        shards: 2,
        length: 10
      })).to.be.instanceOf(stream.Writable);
    });

    it('should create an instance without the new keyword', function() {
      expect(FileDemuxer({
        shards: 2,
        length: 10
      })).to.be.instanceOf(FileDemuxer);
      expect(FileDemuxer({
        shards: 2,
        length: 10
      })).to.be.instanceOf(stream.Writable);
    });

  });

  describe('#write', function() {

    it('should correctly demux the even file stream', function(done) {
      var randomio = noisegen({ length: 4096 });
      var dmx = new FileDemuxer({ shards: 8, length: 4096 });
      var shards = 0;

      dmx.on('shard', function(shard) {
        shards++;
        expect(shard).to.be.instanceOf(stream.Readable);
        var bytes = 0;
        shard.on('data', function(data) {
          bytes += data.length;
        });
        shard.on('end', function() {
          expect(bytes).to.equal(512);
        });
      });

      dmx.on('finish', function() {
        expect(shards).to.equal(8);
        done();
      });

      randomio.pipe(dmx);
    });

    it('should correctly demux the odd file stream', function(done) {
      var randomio = noisegen({ length: 2512 });
      var dmx = new FileDemuxer({ shards: 11, length: 2512 });
      var shards = 0;

      dmx.on('shard', function(shard) {
        shards++;
        expect(shard).to.be.instanceOf(stream.Readable);
        var bytes = 0;
        shard.on('data', function(data) {
          bytes += data.length;
        });
        shard.on('end', function() {
          expect(bytes).to.equal(251);
        });
      });

      dmx.on('finish', function() {
        expect(shards).to.equal(11);
        done();
      });

      randomio.pipe(dmx);
    });

    it('should error if more data than declared is written', function(done) {
      var randomio = noisegen({ length: 256 });
      var dmx = new FileDemuxer({ shards: 4, length: 128 });

      dmx.on('error', function(err) {
        expect(err.message).to.equal('Write amount exceeds the length');
        done();
      });

      randomio.pipe(dmx);
    });

  });

});
