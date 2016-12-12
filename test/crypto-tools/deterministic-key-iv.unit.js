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

  it('should generate a deterministic key', function() {
    var seed = Buffer.from('5eb00bbddcf069084889a8ab9155568165f5c453ccb85e708' +
                           '11aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43d' +
                           'aea6690f20ad3d8d48b2d2ce9e38e4', 'hex');
    var bucketId = Buffer.from('0123456789ab0123456789ab', 'hex');
    var bucketKey = DeterministicKeyIv.getDeterministicKey(seed, bucketId);
    expect(bucketKey).to.equal('b2464469e364834ad21e24c64f637c39083af5067693'+
                               '605c84e259447644f6f6');
  });

  it('should generate a deterministic key (using hex strings)', function() {
    var seed = '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5' +
        'fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';
    var bucketId = '0123456789ab0123456789ab';
    var bucketKey = DeterministicKeyIv.getDeterministicKey(seed, bucketId);
    expect(bucketKey).to.equal('b2464469e364834ad21e24c64f637c39083af5067693'+
                               '605c84e259447644f6f6');
  });

  it('should throw with unexpected string for seed', function() {
    var seed = 'not a hex string';
    var bucketId = '0123456789ab0123456789ab';
    expect(function() {
      DeterministicKeyIv.getDeterministicKey(seed, bucketId);
    }).to.throw('key is expected to be a buffer or hex string');
  });

  it('should throw with unexpected string for bucketId', function() {
    var seed = '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5' +
        'fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';
    var bucketId = 'not a hex string';
    expect(function() {
      DeterministicKeyIv.getDeterministicKey(seed, bucketId);
    }).to.throw('id is expected to be a buffer or hex string');
  });

});

describe('DeterministicKeyIv#getCipherKeyIv', function() {

  it('should generate a deterministic key', function() {
    var keyiv1 = new DeterministicKeyIv('0123', '0123');
    var cipherIv = keyiv1.getCipherKeyIv();
    expect(cipherIv[0].toString('hex').startsWith('1be2e')).to.equal(true);
    expect(cipherIv[1].toString('hex').startsWith('bb3d1')).to.equal(true);
  });

});
