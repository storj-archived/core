'use strict';

var expect = require('chai').expect;
var Unpadder = require('../lib/unpadder');

describe('Unpadder', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Unpadder()).to.be.instanceOf(Unpadder);
    });

    it('should create instance with the new keyword', function() {
      expect(new Unpadder()).to.be.instanceOf(Unpadder);
    });

  });

  describe('#_transform', function() {

    it('should unpad the data if it looks like padding', function(done) {
      var unpadder = new Unpadder();
      var buffer = new Buffer([1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0]);
      var unpadded = Buffer([]);
      unpadder.on('data', function(chunk) {
        unpadded = Buffer.concat([unpadded, chunk]);
      }).on('end', function() {
        expect(unpadded).to.have.lengthOf(6);
        expect(Buffer.compare(unpadded, buffer.slice(0, 6))).to.equal(0);
        done();
      });
      unpadder.end(buffer);
    });

    it('should not unpad the data if it dopes not end with 0', function(done) {
      var unpadder = new Unpadder();
      var buffer = new Buffer([1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 7]);
      var unpadded = Buffer([]);
      unpadder.on('data', function(chunk) {
        unpadded = Buffer.concat([unpadded, chunk]);
      }).on('end', function() {
        expect(unpadded).to.have.lengthOf(12);
        expect(Buffer.compare(unpadded, buffer)).to.equal(0);
        done();
      });
      unpadder.end(buffer);
    });

  });

});
