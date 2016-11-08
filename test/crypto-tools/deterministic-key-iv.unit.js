'use strict';

var expect = require('chai').expect;
var DeterministicKeyIv = require('../../lib/crypto-tools/deterministic-key-iv');

describe('DeterministicKeyIv', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(DeterministicKeyIv()).to.be.instanceOf(DeterministicKeyIv);
    });

    it('should create an instance with the new keyword', function() {
      expect(new DeterministicKeyIv()).to.be.instanceOf(DeterministicKeyIv);
    });

  });

  describe('#toObject', function() {

    it('should return the salt, pass, and type', function() {
      var keyiv1 = new DeterministicKeyIv('012345678', '012345678');
      var object = keyiv1.toObject();
      expect(object.type).to.equal('DeterministicKeyIv');
      expect(object.pass).to.equal(keyiv1._pass);
      expect(object.salt).to.equal(keyiv1._salt);
    });

  });

});

describe('DeterministicKeyIv#fromObject', function() {

  it('should create the instance from the result of #toObject', function() {
    var keyiv1 = new DeterministicKeyIv('0123', '0123');
    var keyiv2 = DeterministicKeyIv.fromObject(keyiv1.toObject());
    expect(keyiv1._pass).to.equal(keyiv2._pass);
    expect(keyiv1._salt).to.equal(keyiv2._salt);
  });

});

describe('DeterministicKeyIv#getDeterministicKey', function() {

  it('should generate an HD key', function() {
    var seed = '0123456789ab0123456789ab';
    var bucketId = '0123456789ab';
    var bucketKey = DeterministicKeyIv.getDeterministicKey(seed, bucketId);
    var bucketKeyStart = 'ba24525';
    expect(bucketKey.startsWith(bucketKeyStart)).to.equal(true);
  });

});

describe('DeterministicKeyIv#getCipherKeyIv', function() {

  it('should generate an HD key', function() {
    var keyiv1 = new DeterministicKeyIv('0123', '0123');
    var cipherIv = keyiv1.getCipherKeyIv();
    expect(cipherIv[0].toString('hex').startsWith('1be2e')).to.equal(true);
    expect(cipherIv[1].toString('hex').startsWith('bb3d1')).to.equal(true);
  });

});