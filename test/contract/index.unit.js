'use strict';

var crypto = require('crypto');
var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var HDKey = require('hdkey');
var KeyPair = require('../../lib/crypto-tools/keypair');
var constants = require('../../lib/constants');
var ms = require('ms');
var utils = require('../../lib/utils');

var kp1 = new KeyPair();
var kp2 = new KeyPair();

describe('Contract#fromObject', function() {

  it('should return an instance from the object', function() {
    expect(Contract.fromObject({})).to.be.instanceOf(Contract);
  });

});

describe('Contract#fromJSON', function() {

  it('should return an instance from the json string', function() {
    expect(Contract.fromJSON('{}')).to.be.instanceOf(Contract);
  });

});

describe('Contract#fromBuffer', function() {

  it('should return an instance from the object', function() {
    expect(Contract.fromBuffer(new Buffer('{}'))).to.be.instanceOf(Contract);
  });

});

describe('Contract#compare', function() {

  it('should return true for the same contract', function() {
    var c1 = Contract.fromBuffer(new Buffer('{}'));
    var c2 = Contract.fromBuffer(new Buffer('{}'));
    expect(Contract.compare(c1, c2)).to.be.equal(true);
  });

});

describe('Contract#diff', function() {

  it('should return an array of differing properties', function() {
    var diff = Contract.diff(
      Contract({ data_hash: utils.rmd160('beep') }),
      Contract({ data_hash: utils.rmd160('boop') })
    );
    expect(diff).to.have.lengthOf(1);
    expect(diff[0]).to.equal('data_hash');
  });

});

describe('Contract#MATRIX', function() {

  describe('#size', function() {

    it('should return low degree', function() {
      expect(Contract.MATRIX.size(
        8 * 1024 * 1024
      )).to.equal(constants.OPCODE_DEG_LOW);
    });

    it('should return medium degree', function() {
      expect(Contract.MATRIX.size(
        64 * 1024 * 1024
      )).to.equal(constants.OPCODE_DEG_MED);
    });

    it('should return high degree', function() {
      expect(Contract.MATRIX.size(
        1024 * 1024 * 1024
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

    it('should return null degree', function() {
      expect(Contract.MATRIX.size(
        8192 * 1024 * 1024
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

  });

  describe('#duration', function() {

    it('should return low degree', function() {
      expect(Contract.MATRIX.duration(
        ms('30d')
      )).to.equal(constants.OPCODE_DEG_LOW);
    });

    it('should return medium degree', function() {
      expect(Contract.MATRIX.duration(
        ms('90d')
      )).to.equal(constants.OPCODE_DEG_MED);
    });

    it('should return high degree', function() {
      expect(Contract.MATRIX.duration(
        ms('320d')
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

    it('should return null degree', function() {
      expect(Contract.MATRIX.duration(
        ms('365d')
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

  });

  describe('#availability', function() {

    it('should return low degree', function() {
      expect(Contract.MATRIX.availability(
        0.7
      )).to.equal(constants.OPCODE_DEG_LOW);
    });

    it('should return medium degree', function() {
      expect(Contract.MATRIX.availability(
        0.9
      )).to.equal(constants.OPCODE_DEG_MED);
    });

    it('should return high degree', function() {
      expect(Contract.MATRIX.availability(
        1
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

    it('should return null degree', function() {
      expect(Contract.MATRIX.availability(
        2
      )).to.equal(constants.OPCODE_DEG_HIGH);
    });

  });

  describe('#speed', function() {

    it('should return low degree', function() {
      expect(Contract.MATRIX.speed(6)).to.equal(constants.OPCODE_DEG_LOW);
    });

    it('should return medium degree', function() {
      expect(Contract.MATRIX.speed(12)).to.equal(constants.OPCODE_DEG_MED);
    });

    it('should return high degree', function() {
      expect(Contract.MATRIX.speed(32)).to.equal(constants.OPCODE_DEG_HIGH);
    });

    it('should return null degree', function() {
      expect(Contract.MATRIX.speed(64)).to.equal(constants.OPCODE_DEG_HIGH);
    });

  });

});

describe('Contract (private)', function() {

  describe('#_clean', function() {

    it('should remove any non-standard contract fields', function() {
      var contract = new Contract();
      contract._properties.INVALID = 'INVALID';
      contract._clean();
      expect(contract._properties.INVALID).to.equal(undefined);
    });

  });

  describe('#getSigningData', function() {

    it('should remove the signature fields', function() {
      var contract = new Contract();
      var signingObject = JSON.parse(contract.getSigningData());
      expect(signingObject.farmer_signature).to.equal(undefined);
      expect(signingObject.renter_signature).to.equal(undefined);
    });

  });

  describe('#_validate', function() {

    it('should validate the contract specification', function() {
      expect(function() {
        Contract();
      }).to.not.throw(Error);
    });

    it('should invalidate the contract specification', function() {
      expect(function() {
        Contract({ version: -1 });
      }).to.throw(Error);
    });

    describe('hd keys', function() {
      var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
          'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
          'ce8af';
      var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
      var hdKey = masterKey.derive('m/3000\'/0\'');
      it('will validate with correct hd key and index', function() {
        var contract = Contract({
          renter_hd_key: hdKey.publicExtendedKey,
          renter_hd_index: 12
        });
        expect(contract);
      });
      it('will not validate with non-base58 hdkey', function() {
        expect(function() {
          Contract({renter_hd_key: '0lI'});
        }).to.throw(Error);
      });
      it('will not validate with negative hd index', function() {
        expect(function() {
          Contract({
            renter_hd_key: hdKey.publicExtendedKey,
            renter_hd_index: -1
          });
        }).to.throw(Error);
      });
      it('will not validate with hardened index', function() {
        expect(function() {
          Contract({
            renter_hd_key: hdKey.publicExtendedKey,
            renter_hd_index: Math.pow(2, 31)
          });
        }).to.throw(Error);
      });
      it('will not validate with floating point index', function() {
        expect(function() {
          Contract({
            renter_hd_key: hdKey.publicExtendedKey,
            renter_hd_index: 3.14159
          });
        }).to.throw(Error);
      });
    });

  });

  describe('#isComplete', function() {

    it('should return false if fields are null', function() {
      expect(Contract().isComplete()).to.equal(false);
    });

    it('should return true if fields are not null', function() {
      var kp1 = KeyPair();
      var kp2 = KeyPair();
      var contract = new Contract({
        renter_id: kp1.getNodeID(),
        farmer_id: kp2.getNodeID(),
        payment_source: kp1.getAddress(),
        payment_destination: kp2.getAddress(),
        data_hash: crypto.createHash('rmd160').update('test').digest('hex')
      });
      contract.sign('renter', kp1.getPrivateKey());
      contract.sign('farmer', kp2.getPrivateKey());
      expect(contract.isComplete()).to.equal(true);
    });

  });

});

describe('Contract (public)', function() {

  describe('#getHash', function() {

    it('should return the SHA-256 hash of the serialized contract', function() {
      expect(Contract().getHash().length).to.equal(32);
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

  describe('#sign', function() {

    it('should add the farmer signature', function() {
      var contract = new Contract();
      expect(contract._properties.renter_signature).to.equal(null);
      contract.sign('renter', kp1.getPrivateKey());
      expect(contract._properties.renter_signature).to.not.equal(null);
    });

    it('should add the renter signature', function() {
      var contract = new Contract();
      expect(contract._properties.farmer_signature).to.equal(null);
      contract.sign('farmer', kp2.getPrivateKey());
      expect(contract._properties.farmer_signature).to.not.equal(null);
    });

  });

  describe('#verify', function() {

    it('should verify farmer signature', function() {
      var contract = new Contract();
      contract.sign('farmer', kp2.getPrivateKey());
      expect(contract.verify('farmer', kp2.getNodeID())).to.equal(true);
    });

    it('should invalidate renter signature', function() {
      var contract = new Contract();
      contract.sign('renter', kp2.getPrivateKey());
      expect(contract.verify('renter', kp1.getNodeID())).to.equal(false);
    });

  });

  describe('#get', function() {

    it('should return the property value', function() {
      expect(Contract().get('payment_storage_price')).to.equal(0);
    });

    it('should return undefined', function() {
      expect(Contract().get('invalid_property')).to.equal(undefined);
    });

    it('should return renter_hd_key and renter_hd_index', function() {
      var hdKey = 'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnL' +
          'Fbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt';
      var contract = Contract({renter_hd_key: hdKey, renter_hd_index: 12});
      expect(contract.get('renter_hd_key')).to.equal(hdKey);
      expect(contract.get('renter_hd_index')).to.equal(12);
    });

  });

  describe('#set', function() {

    it('should set and return the property value', function() {
      var contract = new Contract();
      var amount = contract.set('payment_storage_price', 100);
      expect(amount).to.equal(100);
      expect(contract._properties.payment_storage_price).to.equal(100);
    });

    it('should return undefined', function() {
      var contract = new Contract();
      var value = contract.set('invalid_property', 100);
      expect(value).to.equal(undefined);
      expect(contract._properties.invalid_property).to.equal(undefined);
    });

  });

  describe('#update', function() {

    it('should update all the supplied fields', function() {
      var contract = new Contract();
      contract.update({
        payment_storage_price: 100,
        invalid_property: true
      });
      expect(contract._properties.payment_storage_price).to.equal(100);
      expect(contract._properties.invalid_property).to.equal(undefined);
    });

  });

});
