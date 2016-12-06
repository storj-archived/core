'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var FileMuxer = require('../../lib/file-handling/file-muxer');
var ReadableStream = require('readable-stream');
var utils = require('../../lib/utils');

describe('FileMuxer', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  describe('@constructor', function() {

    it('should create an instance with the new keyword', function() {
      expect(new FileMuxer({
        shards: 4,
        length: 4096
      })).to.be.instanceOf(FileMuxer);
      expect(new FileMuxer({
        shards: 4,
        length: 4096
      })).to.be.instanceOf(ReadableStream);
    });

    it('should create an instance without the new keyword', function() {
      expect(FileMuxer({
        shards: 4,
        length: 4096
      })).to.be.instanceOf(FileMuxer);
      expect(FileMuxer({
        shards: 4,
        length: 4096
      })).to.be.instanceOf(ReadableStream);
    });

  });

  describe('#input', function() {

    it('should not allow more than defined shards', function() {
      var hash = '20e0f5160ca11fb3646e6f6ede0c3ae9a340f8df';
      var exchangeReport = {};
      var bridgeClient = {};
      var fmxr = new FileMuxer({ shards: 2, length: 4096 });
      var rs1 = new ReadableStream();
      var rs2 = new ReadableStream();
      fmxr.addInputSource(rs1, hash, exchangeReport, bridgeClient);
      fmxr.addInputSource(rs2, hash, exchangeReport, bridgeClient);
      expect(function() {
        var rs3 = new ReadableStream();
        fmxr.addInputSource(rs3, hash, exchangeReport, bridgeClient);
      }).to.throw(Error, 'Inputs exceed defined number of shards');
    });

    it('should handle error from readable error', function(done) {
      var hash = '20e0f5160ca11fb3646e6f6ede0c3ae9a340f8df';
      var exchangeReport = {
        end: sinon.stub()
      };
      var bridgeClient = {
        createExchangeReport: sinon.stub()
      };
      var fmxr = new FileMuxer({ shards: 1, length: 4096 });
      fmxr.on('error', function(err) {
        expect(err).to.be.instanceOf(Error);
        done();
      });
      sandbox.stub(ReadableStream.prototype, '_read');
      var rs1 = new ReadableStream();
      fmxr.addInputSource(rs1, hash, exchangeReport, bridgeClient);
      rs1.emit('error', new Error('test'));

    });

  });

  describe('#read', function() {
    it('should multiplex the inputs in the proper order', function(done) {
      var chunks = '';
      var fmxr = new FileMuxer({ shards: 4, length: 71 });
      var rs1 = new ReadableStream({
        read: function() {
          this._count = this._count || 0;

          if (this._count === 10) {
            return this.push(null);
          }

          this.push((++this._count).toString());
        }
      });
      var rs2 = new ReadableStream({
        read: function() {
          this._count = this._count || 10;

          if (this._count === 20) {
            return this.push(null);
          }

          this.push((++this._count).toString());
        }
      });
      var rs3 = new ReadableStream({
        read: function() {
          this._count = this._count || 20;

          if (this._count === 30) {
            return this.push(null);
          }

          this.push((++this._count).toString());
        }
      });
      var rs4 = new ReadableStream({
        read: function() {
          this._count = this._count || 30;

          if (this._count === 40) {
            return this.push(null);
          }

          this.push((++this._count).toString());
        }
      });

      var hash = '48323293838c914e4f336d18dd4e427d5371e4d2';
      var hash2 = 'c234f58b707d86efbde1416473df27f4ce0baa60';

      sandbox.stub(utils, 'rmd160').returns(hash);

      var exchangeReport = {
        begin: sinon.stub().returns(),
        end: sinon.stub().returns()
      };
      var bridgeClient = {
        createExchangeReport: sinon.stub()
      };


      var hasError = false;

      fmxr.on('error', function(err) {
        hasError = err;
      });

      fmxr
        .addInputSource(rs1, hash, exchangeReport, bridgeClient)
        .addInputSource(rs2, hash, exchangeReport, bridgeClient)
        .addInputSource(rs3, hash, exchangeReport, bridgeClient)
        .addInputSource(rs4, hash2, exchangeReport, bridgeClient)
        .on('data', function(data) {
          chunks += data;
        })
        .on('end', function() {
          expect(chunks).to.equal(
            '1234567891011121314151617181920' +
            '2122232425262728293031323334353637383940'
          );

          expect(exchangeReport.begin.callCount).to.equal(4);
          expect(exchangeReport.end.callCount).to.equal(4);
          expect(exchangeReport.end.args).to.deep.equal([
            [ 1000, 'SHARD_DOWNLOADED' ],
            [ 1000, 'SHARD_DOWNLOADED' ],
            [ 1000, 'SHARD_DOWNLOADED' ],
            [ 1100, 'FAILED_INTEGRITY' ]
          ]);
          expect(bridgeClient.createExchangeReport.callCount).to.equal(4);
          expect(hasError);
          done();
        });
    });

    it('should wait until next tick if no input is available', function(done) {
      var pushed = false;
      var hash = '48323293838c914e4f336d18dd4e427d5371e4d2';
      var exchangeReport = {
        begin: sinon.stub()
      };
      var bridgeClient = {};
      var mux = FileMuxer({ shards: 2, length: 128 }).on('data', function() {
        done();
      });
      var readable = ReadableStream({
        read: function() {
          if (pushed) {
            this.push(null);
          } else {
            pushed = true;
            this.push(Buffer('hay gurl hay'));
          }
        }
      });
      mux.addInputSource(readable, hash, exchangeReport, bridgeClient);
    });

    it('should error if input length exceeds declared length', function(done) {
      var chunks = [0x01, 0x02, 0x03];
      var hash = '48323293838c914e4f336d18dd4e427d5371e4d2';
      var exchangeReport = {
        begin: sinon.stub()
      };
      var bridgeClient = {};
      var readable = ReadableStream({
        read: function() {
          var chunk = chunks.pop();
          this.push(chunk ? Buffer([chunk]) : null);
        }
      });
      var fmx = FileMuxer({ shards: 1, length: 2 }).on('error', function(err) {
        expect(err.message).to.equal('Input exceeds expected length');
        done();
      });
      fmx.addInputSource(readable, hash, exchangeReport, bridgeClient);
      setImmediate(fmx.read.bind(fmx));
    });

    it('should wait for an available source before reading', function(done) {
      var chunks = [0x01, 0x02];
      var hash = '48323293838c914e4f336d18dd4e427d5371e4d2';
      var exchangeReport = {
        begin: sinon.stub().returns(),
        end: sinon.stub().returns()
      };
      var bridgeClient = {
        createExchangeReport: sinon.stub()
      };
      sandbox.stub(utils, 'rmd160').returns(hash);
      var fmx = FileMuxer({ shards: 1, length: 2 });
      fmx.on('data', function() {}).on('end', done);
      setImmediate(function() {
        var readable = ReadableStream({
          read: function() {
            var chunk = chunks.pop();
            this.push(chunk ? Buffer([chunk]) : null);
          }
        });
        fmx.addInputSource(readable, hash, exchangeReport, bridgeClient);
      });
    });

    it('should error if source unavailable after timeout', function(done) {
      var fmx = FileMuxer({ shards: 1, length: 2, sourceDrainWait: 0 });
      fmx.on('data', function() {}).on('error', function(err) {
        expect(err.message).to.equal('Unexpected end of source stream');
        done();
      });

    });

  });

});
