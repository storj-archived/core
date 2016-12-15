'use strict';

var expect = require('chai').expect;
var FileDemuxer = require('../../lib/file-handling/file-demuxer');
var stream = require('readable-stream');
var noisegen = require('noisegen');
var os = require('os');
var fs = require('fs');
var path = require('path');
var utils = require('../../lib/utils');
var TMP_DIR = path.join(os.tmpdir(), 'STORJ_FILEDEMUXER_TEST');
var filePathEven = path.join(TMP_DIR, 'storjfiledmxtest-even.data');
var filePathOdd = path.join(TMP_DIR, 'storjfiledmxtest-odd.data');
var filePathEmpty = path.join(TMP_DIR, 'storjfiledmxtest-empty.data');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var proxyquire = require('proxyquire');

describe('FileDemuxer', function() {

  before(function(done) {
    this.timeout(6000);

    if (utils.existsSync(TMP_DIR)) {
      rimraf.sync(TMP_DIR);
    }

    mkdirp.sync(TMP_DIR);

    var randomEven = noisegen({ length: 1024 * 1024 * 8 });
    var tmpfile = fs.createWriteStream(filePathEven);

    tmpfile.on('finish', function() {
      var randomOdd = noisegen({ length: (1024 * 1024 * 16) + 512 });
      var tmpfile = fs.createWriteStream(filePathOdd);

      tmpfile.on('finish', done);
      randomOdd.pipe(tmpfile);
    });
    randomEven.pipe(tmpfile);
  });

  after(function() {
    rimraf.sync(TMP_DIR);
  });

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

describe('FileDemuxer#getOptimalShardSize', function() {

  var FileDemuxerStub = proxyquire('../../lib/file-handling/file-demuxer', {
    'os': {
      freemem: function() {
        return 1024 * (1024 * 1024); //1GB of memory
      }
    }
  });

  it('should return 8 for 8', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 3 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

  it('should return 8 for 16', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 16 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

  it('should return 8 for 32', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 32 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

  it('should return 8 for 64', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 64 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

  it('should return 8 for 128', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 128 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

  it('should return 16 for 256', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 256 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(16 * (1024 * 1024));
  });

  it('should return 32 for 512', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 512 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(32 * (1024 * 1024));
  });

  it('should return 64 for 1024', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 1024 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(64 * (1024 * 1024));
  });

  it('should return 128 for 2048', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 2048 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(128 * (1024 * 1024));
  });

  it('should return 256 for 4096', function() {
    expect(
      FileDemuxerStub.getOptimalShardSize(
        {
          fileSize: 4096 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(256 * (1024 * 1024));
  });

  it('should return 8 for 4096 if only 16MB of memory', function() {
    var LowMemDemuxer = proxyquire('../../lib/file-handling/file-demuxer', {
      'os': {
        freemem: function() {
          return 16 * (1024 * 1024); // 16MB of memory
        }
      }
    });

    expect(
      LowMemDemuxer.getOptimalShardSize(
        {
          fileSize: 4096 * (1024 * 1024),
          shardConcurrency: 3
        }
      )
    ).to.equal(8 * (1024 * 1024));
  });

});
