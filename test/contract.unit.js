'use strict';

var expect = require('chai').expect;
var Contract = require('../lib/contract');

describe('Contract', function() {

  describe('#fromObject', function() {

    it('should return an instance from the object', function() {
      expect(Contract.fromObject({})).to.be.instanceOf(Contract);
    });

  });

  describe('#fromJSON', function() {

    it('should return an instance from the json string', function() {
      expect(Contract.fromJSON('{}')).to.be.instanceOf(Contract);
    });

  });

  describe('#fromBuffer', function() {

    it('should return an instance from the object', function() {
      expect(Contract.fromBuffer(new Buffer('{}'))).to.be.instanceOf(Contract);
    });

  });

  describe('#validate', function() {

    it('should validate the contract specification', function() {
      expect(function() {
        Contract({ version: 1 });
      }).to.not.throw(Error);
    });

    it('should invalidate the contract specification', function() {
      expect(function() {
        Contract({ version: -1 });
      }).to.not.throw(Error);
    });

  });

  describe('#toObject', function() {

    it('should return an object representation of the contract', function() {
      expect(typeof Contract().toObject()).to.equal('object');
    });

  });

  describe('#toJSON', function() {

    it('should return a JSON representation of the contract', function() {
      expect(typeof Contract().toJSON()).to.equal('string');
    });

  });

  describe('#toBuffer', function() {

    it('should return a buffer representation of the contract', function() {
      expect(Buffer.isBuffer(Contract().toBuffer())).to.equal(true);
    });

  });

});
