'use strict';

const { utils: keyutils } = require('kad-spartacus');
const crypto = require('crypto');
const expect = require('chai').expect;
const Contract = require('../lib/contract');
const constants = require('../lib/constants');
const ms = require('ms');
const utils = require('../lib/utils');
const sinon = require('sinon');


describe('@class Contract', function() {

  describe('@static createTopic', function() {

    it('should return the topic buffer', function() {
      expect(Contract.createTopic().toString('hex')).to.equal('0f02020202');
    });

  });

  describe('@static from', function() {

    let fromObject, fromJSON, fromBuffer;
    let sandbox = sinon.sandbox.create();

    before(() => {
      fromBuffer = sandbox.stub(Contract, 'fromBuffer');
      fromObject = sandbox.stub(Contract, 'fromObject');
      fromJSON = sandbox.stub(Contract, 'fromJSON');
    });

    it('should call Contract#fromBuffer', function() {
      Contract.from(Buffer.from('{}'));
      expect(fromBuffer.called).to.equal(true);
    });

    it('should call Contract#fromJSON', function() {
      Contract.from('{}');
      expect(fromJSON.called).to.equal(true);
    });

    it('should call Contract#fromObject', function() {
      Contract.from({});
      expect(fromObject.called).to.equal(true);
    });

    it('should call Contract#fromObject and c#toObject', function() {
      let toObject = sinon.stub();
      let contract = new Contract();
      contract.toObject = toObject;
      Contract.from(contract);
      expect(fromObject.called).to.equal(true);
      expect(toObject.called).to.equal(true);
    });

    after(() => {
      sandbox.restore();
    });

  });

  describe('@static fromObject', function() {

    it('should return an instance from the object', function() {
      expect(Contract.fromObject({})).to.be.instanceOf(Contract);
    });

  });

  describe('@static fromJSON', function() {

    it('should return an instance from the json string', function() {
      expect(Contract.fromJSON('{}')).to.be.instanceOf(Contract);
    });

  });

  describe('@static fromBuffer', function() {

    it('should return an instance from the object', function() {
      expect(Contract.fromBuffer(Buffer.from('{}'))).to.be.instanceOf(Contract);
    });

  });

  describe('@static compare', function() {

    it('should return true for the same contract', function() {
      const c1 = Contract.fromBuffer(Buffer.from('{}'));
      const c2 = Contract.fromBuffer(Buffer.from('{}'));
      expect(Contract.compare(c1, c2)).to.be.equal(true);
    });

  });

  describe('@static diff', function() {

    it('should return an array of differing properties', function() {
      const diff = Contract.diff(
        new Contract({
          data_hash: utils.rmd160('beep').toString('hex'),
          audit_leaves: ['one', 'two']
        }),
        new Contract({
          data_hash: utils.rmd160('boop').toString('hex'),
          audit_leaves: ['three', 'four']
        })
      );
      expect(diff).to.have.lengthOf(2);
      expect(diff[0]).to.equal('audit_leaves');
      expect(diff[1]).to.equal('data_hash');
    });

  });

  describe('@static MATRIX#size', function() {

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

  describe('@static MATRIX#duration', function() {

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

  describe('@static MATRIX#availability', function() {

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

  describe('@static MATRIX#speed', function() {

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

  describe('@private _clean', function() {

    it('should remove any non-standard contract fields', function() {
      const contract = new Contract();
      contract._properties.INVALID = 'INVALID';
      contract._clean();
      expect(contract._properties.INVALID).to.equal(undefined);
    });

  });

  describe('@method getSigningData', function() {

    it('should remove the signature fields', function() {
      const contract = new Contract();
      const signingObject = JSON.parse(contract.getSigningData());
      expect(signingObject.farmer_signature).to.equal(undefined);
      expect(signingObject.renter_signature).to.equal(undefined);
    });

  });

  describe('@method isValid', function() {

    it('should validate the contract specification', function() {
      const c = new Contract();
      expect(c.isValid()).to.equal(true);
    });

    it('should invalidate the contract specification', function() {
      const c = new Contract({ version: -1 });
      expect(c.isValid()).to.equal(false);
    });

  });

  describe('@method isComplete', function() {

    it('should return false if fields are null', function() {
      const c = new Contract();
      expect(c.isComplete()).to.equal(false);
    });

    it('should return true if fields are not null', function() {
      const renterHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const farmerHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const contract = new Contract({
        renter_id: keyutils.toPublicKeyHash(renterHdKey.publicKey)
                     .toString('hex'),
        farmer_id: keyutils.toPublicKeyHash(farmerHdKey.publicKey)
                     .toString('hex'),
        renter_hd_key: renterHdKey.publicExtendedKey,
        farmer_hd_key: farmerHdKey.publicExtendedKey,
        renter_hd_index: 1,
        farmer_hd_index: 1,
        payment_destination: '14WNyp8paus83JoDvv2SowKb3j1cZBhJoV',
        data_hash: crypto.createHash('rmd160').update('test').digest('hex')
      });
      contract.sign('renter', renterHdKey.privateKey);
      contract.sign('farmer', farmerHdKey.privateKey);
      expect(contract.isComplete()).to.equal(true);
    });

  });

  describe('@method getHash', function() {

    it('should return the SHA-256 hash of the serialized contract', function() {
      const c = new Contract();
      expect(c.getHash().length).to.equal(32);
    });

  });

  describe('@method toObject', function() {

    it('should return an object representation of the contract', function() {
      const c = new Contract();
      expect(typeof c.toObject()).to.equal('object');
    });

  });

  describe('@method toJSON', function() {

    it('should return a JSON representation of the contract', function() {
      const c = new Contract();
      expect(typeof c.toJSON()).to.equal('string');
    });

  });

  describe('@method toBuffer', function() {

    it('should return a buffer representation of the contract', function() {
      const c = new Contract();
      expect(Buffer.isBuffer(c.toBuffer())).to.equal(true);
    });

  });

  describe('@method sign', function() {

    it('should add the farmer signature', function() {
      const contract = new Contract();
      expect(contract._properties.renter_signature).to.equal(null);
      contract.sign('renter', keyutils.toHDKeyFromSeed().privateKey);
      expect(contract._properties.renter_signature).to.not.equal(null);
    });

    it('should add the renter signature', function() {
      const contract = new Contract();
      expect(contract._properties.farmer_signature).to.equal(null);
      contract.sign('farmer', keyutils.toHDKeyFromSeed().privateKey);
      expect(contract._properties.farmer_signature).to.not.equal(null);
    });

  });

  describe('@method verify', function() {

    it('should verify farmer signature', function() {
      const farmerBaseKey = keyutils.toHDKeyFromSeed(
        null,
        constants.HD_KEY_DERIVATION_PATH
      );
      const farmerChildKey = farmerBaseKey.deriveChild(6);
      const contract = new Contract({
        farmer_id: keyutils.toPublicKeyHash(farmerChildKey.publicKey)
                     .toString('hex'),
        farmer_hd_key: farmerBaseKey.publicExtendedKey,
        farmer_hd_index: 6
      });
      contract.sign('farmer', farmerChildKey.privateKey);
      expect(contract.verify('farmer')).to.equal(true);
    });

    it('should invalidate renter signature', function() {
      const renterBaseKey = keyutils.toHDKeyFromSeed(
        null,
        constants.HD_KEY_DERIVATION_PATH
      );
      const renterChildKey = renterBaseKey.deriveChild(6);
      const contract = new Contract({
        renter_id: keyutils.toPublicKeyHash(renterChildKey.publicKey)
                     .toString('hex'),
        renter_hd_key: renterBaseKey.publicExtendedKey,
        renter_hd_index: 6
      });
      contract.sign('renter', keyutils.toHDKeyFromSeed().privateKey);
      expect(contract.verify('renter')).to.equal(false);
    });

  });

  describe('@method get', function() {

    it('should return the property value', function() {
      const c = new Contract();
      expect(c.get('payment_storage_price')).to.equal(0);
    });

    it('should return undefined', function() {
      const c = new Contract();
      expect(c.get('invalid_property')).to.equal(undefined);
    });

    it('should return renter_hd_key and renter_hd_index', function() {
      var hdKey = 'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnL' +
          'Fbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt';
      var contract = new Contract({renter_hd_key: hdKey, renter_hd_index: 12});
      expect(contract.get('renter_hd_key')).to.equal(hdKey);
      expect(contract.get('renter_hd_index')).to.equal(12);
    });

  });

  describe('@method set', function() {

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

  describe('@method update', function() {

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

  describe('@method getTopicBuffer', function() {

    it('should return the topic code as a buffer', function() {
      const contract = new Contract({});
      expect(Buffer.compare(
        Buffer.from('0f01010202', 'hex'),
        contract.getTopicBuffer()
      )).to.equal(0);
    });

  });

  describe('@method getTopicString', function() {

    it('should return the topic code as a string', function() {
      const contract = new Contract({});
      expect(contract.getTopicString()).to.equal('0f01010202');
    });

  });

});
