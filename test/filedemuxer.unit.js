'use strict';

var expect = require('chai').expect;
var FileDemuxer = require('../lib/filedemuxer');
var stream = require('readable-stream');
var noisegen = require('noisegen');
var os = require('os');
var fs = require('fs');
var path = require('path');
var filePathEven = path.join(os.tmpdir(), 'storjfiledmxtest-even.data');
var filePathOdd = path.join(os.tmpdir(), 'storjfiledmxtest-odd.data');

before(function(done) {
  this.timeout(6000);
  
  if (fs.existsSync(filePathEven)) {
    fs.unlinkSync(filePathEven);
  }

  var randomEven = noisegen({ length: 1024 * 1024 * 16 });
  var tmpfile = fs.createWriteStream(filePathEven);

  tmpfile.on('finish', function() {
    if (fs.existsSync(filePathOdd)) {
      fs.unlinkSync(filePathOdd);
    }

    var randomOdd = noisegen({ length: (1024 * 1024 * 8) + 512 });
    var tmpfile = fs.createWriteStream(filePathOdd);

    tmpfile.on('finish', done);
    randomOdd.pipe(tmpfile);
  });
  randomEven.pipe(tmpfile);
});

describe('FileDemuxer', function() {

  describe('@constructor', function() {

    it('should create an instance with the new keyword', function() {
      expect(new FileDemuxer(filePathEven)).to.be.instanceOf(FileDemuxer);
    });

    it('should create an instance without the new keyword', function() {
      expect(FileDemuxer(filePathEven)).to.be.instanceOf(FileDemuxer);
    });

  });

  describe('#event:shard', function() {

    it('should correctly demux the even file stream', function(done) {
      this.timeout(6000);
      var dmx = new FileDemuxer(filePathEven);
      var shards = 0;

      dmx.on('shard', function(shard) {
        shards++;
        expect(shard).to.be.instanceOf(stream.Readable);
        var bytes = 0;
        shard.on('data', function(data) {
          bytes += data.length;
        });
        shard.on('end', function() {
          expect(bytes).to.equal(FileDemuxer.DEFAULTS.shardSize);
          if (shards === 2) {
            done();
          }
        });
      });
    });

    it('should correctly demux the odd file stream', function(done) {
      this.timeout(6000);
      var dmx = new FileDemuxer(filePathOdd);
      var shards = 0;

      dmx.on('shard', function(shard) {
        shards++;
        expect(shard).to.be.instanceOf(stream.Readable);
        var bytes = 0;
        shard.on('data', function(data) {
          bytes += data.length;
        });
        shard.on('end', function() {
          expect(bytes).to.equal(FileDemuxer.DEFAULTS.shardSize);
          if (shards === 2) {
            done();
          }
        });
      });
    });

  });

});
