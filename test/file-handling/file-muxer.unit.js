'use strict';

var expect = require('chai').expect;
var FileMuxer = require('../../lib/file-handling/file-muxer');
var ReadableStream = require('readable-stream');

describe('FileMuxer', function() {

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
      expect(function() {
        var fmxr = new FileMuxer({ shards: 2, length: 4096 });
        var rs1 = new ReadableStream();
        var rs2 = new ReadableStream();
        var rs3 = new ReadableStream();
        fmxr.input(rs1).input(rs2).input(rs3);
      }).to.throw(Error, 'Inputs exceed defined number of shards');
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
      fmxr
        .input(rs1)
        .input(rs2)
        .input(rs3)
        .input(rs4)
        .on('data', function(data) {
          chunks += data;
        })
        .on('end', function() {
          expect(chunks).to.equal(
            '1234567891011121314151617181920' +
            '2122232425262728293031323334353637383940'
          );
          done();
        });
    });

    it('should wait until next tick if no input is available', function(done) {
      var pushed = false;
      FileMuxer({ shards: 2, length: 128 }).on('data', function() {
        done();
      }).input(ReadableStream({
        read: function() {
          if (pushed) {
            this.push(null);
          } else {
            pushed = true;
            this.push(Buffer('hay gurl hay'));
          }
        }
      }));
    });

    it('should error if input length exceeds declared length', function(done) {
      var chunks = [0x01, 0x02, 0x03];
      var fmx = FileMuxer({ shards: 1, length: 2 }).on('error', function(err) {
        expect(err.message).to.equal('Input exceeds expected length');
        done();
      }).input(ReadableStream({
        read: function() {
          var chunk = chunks.pop();
          this.push(chunk ? Buffer([chunk]) : null);
        }
      }));
      setImmediate(fmx.read.bind(fmx));
    });

    it('should wait for an available source before reading', function(done) {
      var chunks = [0x01, 0x02];
      var fmx = FileMuxer({ shards: 1, length: 2 });
      fmx.on('data', function() {}).on('end', done);
      setImmediate(function() {
        fmx.input(ReadableStream({
          read: function() {
            var chunk = chunks.pop();
            this.push(chunk ? Buffer([chunk]) : null);
          }
        }));
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
