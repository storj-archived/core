'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var Padder = require('../../lib/file-handling/padder');

describe('Padder', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Padder()).to.be.instanceOf(Padder);
    });

    it('should create instance with the new keyword', function() {
      expect(new Padder()).to.be.instanceOf(Padder);
    });

  });

  describe('#_transform', function() {

    it('should pad the data to the nearest 8mb', function(done) {
      var padder = new Padder();
      var buffer = new Buffer([1, 2, 3, 4, 5, 6]);
      var padded = Buffer([]);
      padder.on('data', function(chunk) {
        padded = Buffer.concat([padded, chunk]);
      }).on('end', function() {
        expect(padded).to.have.lengthOf(Padder.DEFAULTS.multiple);
        expect(Buffer.compare(buffer, padded.slice(0, 6))).to.equal(0);
        done();
      });
      padder.end(buffer);
    });

  });

  describe('#_flush', function() {

    it('should pad the remainder if it exists', function(done) {
      var padder = new Padder();
      padder._bytesRead = (Padder.DEFAULTS.multiple * 2) - 8;
      padder.on('data', function(data) {
        expect(data.length).to.equal(8);
        done();
      });
      padder._flush(function() {});
    });

    it('should not pad if the bytes read is a multiple', function(done) {
      var padder = new Padder();
      var _push = sinon.stub(padder, 'push');
      padder._bytesRead = (Padder.DEFAULTS.multiple * 2);
      padder._flush(function() {
        expect(_push.called).to.equal(false);
        done();
      });
    });

  });

});
