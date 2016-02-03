'use strict';

var expect = require('chai').expect;
var Contract = require('../lib/contract');
var KeyPair = require('../lib/keypair');

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

describe('Contract', function() {

  var kp1 = new KeyPair();
  var kp2 = new KeyPair();

  describe('#_clean', function() {

    it('should remove any non-standard contract fields', function() {
      var contract = new Contract();
      contract._properties.INVALID = 'INVALID';
      contract._clean();
      expect(contract._properties.INVALID).to.equal(undefined);
    });

  });

  describe('#_getSigningData', function() {

    it('should remove the signature fields', function() {
      var contract = new Contract();
      var signingObject = JSON.parse(contract._getSigningData());
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
        Contract({ type: -1 });
      }).to.throw(Error);
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
      expect(contract.verify('farmer', kp2.getPublicKey())).to.equal(true);
    });

    it('should invalidate renter signature', function() {
      var contract = new Contract();
      contract.sign('renter', kp2.getPrivateKey());
      expect(contract.verify('renter', kp1.getPublicKey())).to.equal(false);
    });

  });

  describe('#get', function() {

    it('should return the property value', function() {
      expect(Contract().get('payment_amount')).to.equal(0);
    });

    it('should return undefined', function() {
      expect(Contract().get('invalid_property')).to.equal(undefined);
    });

  });

  describe('#set', function() {

    it('should set and return the property value', function() {
      var contract = new Contract();
      var amount = contract.set('payment_amount', 100);
      expect(amount).to.equal(100);
      expect(contract._properties.payment_amount).to.equal(100);
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
        payment_amount: 100,
        renter_port: 1337,
        renter_address: '0.0.0.0',
        invalid_property: true
      });
      expect(contract._properties.payment_amount).to.equal(100);
      expect(contract._properties.renter_port).to.equal(1337);
      expect(contract._properties.renter_address).to.equal('0.0.0.0');
      expect(contract._properties.invalid_property).to.equal(undefined);
    });

  });

});
