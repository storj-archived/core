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
var filePathEmpty = path.join(os.tmpdir(), 'storjfiledmxtest-empty.data');

before(function(done) {
  this.timeout(6000);

  if (fs.existsSync(filePathEven)) {
    fs.unlinkSync(filePathEven);
  }

  var randomEven = noisegen({ length: 1024 * 1024 * 8 });
  var tmpfile = fs.createWriteStream(filePathEven);

  tmpfile.on('finish', function() {
    if (fs.existsSync(filePathOdd)) {
      fs.unlinkSync(filePathOdd);
    }

    var randomOdd = noisegen({ length: (1024 * 1024 * 16) + 512 });
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
      var bytes = 0;

      dmx.on('shard', function(shard) {
        shards++;
        expect(shard).to.be.instanceOf(stream.Readable);
        shard.on('data', function(data) {
          bytes += data.length;
        });
      });

      dmx.on('finish', function() {
        expect(bytes).to.equal(1024 * 1024 * 8);
        done();
      });
    });

    it('should correctly demux the odd file stream', function(done) {
      this.timeout(6000);
      var dmx = new FileDemuxer(filePathOdd);
      var shards = 0;

      dmx.on('shard', function(shard) {
        expect(shard).to.be.instanceOf(stream.Readable);
        var bytes = 0;
        shard.on('data', function(data) {
          bytes += data.length;
        });
        shard.on('end', function() {
          shards++;
          if (shards === 1) {
            expect(bytes).to.equal(FileDemuxer.DEFAULTS.shardSize);
          } else if (shards === 3) {
            expect(bytes).to.equal(512);
            done();
          }
        });
      });
    });

    it('should emit an error if file size is 0B', function(done) {
      this.timeout(6000);

      fs.closeSync(fs.openSync(filePathEmpty, 'w'));

      var dmx = new FileDemuxer(filePathEmpty);

      dmx.on('error', function(err) {
        expect(err.message).to.equal('File size cannot be 0 Bytes.');
        done();
      });
    });

  });

});
