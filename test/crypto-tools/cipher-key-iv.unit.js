'use strict';

var expect = require('chai').expect;
var DataCipherKeyIv = require('../../lib/crypto-tools/cipher-key-iv');

describe('DataCipherKeyIv', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(DataCipherKeyIv()).to.be.instanceOf(DataCipherKeyIv);
    });

    it('should create an instance with the new keyword', function() {
      expect(new DataCipherKeyIv()).to.be.instanceOf(DataCipherKeyIv);
    });

    it('should create the same pbkdf2 data', function() {
      var c1 = new DataCipherKeyIv();
      var c2 = DataCipherKeyIv.fromObject(c1.toObject());
      expect(Buffer.compare(c1._pbkdf2, c2._pbkdf2)).to.equal(0);
    });

  });

  describe('#toObject', function() {

    it('should return the salt and pass', function() {
      var keyiv1 = new DataCipherKeyIv();
      var object = keyiv1.toObject();
      expect(object.pass).to.equal(keyiv1._pass.toString('hex'));
      expect(object.salt).to.equal(keyiv1._salt.toString('hex'));
    });

  });

});

describe('DataCipherKeyIv#fromObject', function() {

  it('should create the instance from the result of #toObject', function() {
    var keyiv1 = new DataCipherKeyIv();
    var keyiv2 = DataCipherKeyIv.fromObject(keyiv1.toObject());
    expect(Buffer.compare(keyiv1._pass, keyiv2._pass)).to.equal(0);
    expect(Buffer.compare(keyiv1._salt, keyiv2._salt)).to.equal(0);
  });

});