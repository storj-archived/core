'use strict';

var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');
var prvk = '4d548b387bed22aff9ca560416d7b13ecbad16f28bc41ef5acaff3019bfa5134';
var pubk = '02ad47e0d4896cd794f5296a953f897c426b3f9a58f5203b8baace8952a291cf6b';

describe('KeyPair', function() {

  describe('@constructor', function() {

    it('should work without the new keyword', function() {
      expect(KeyPair()).to.be.instanceOf(KeyPair);
    });

  });

  describe('#getPrivateKey', function() {

    it('should use the private key supplied if provided', function() {
      var kp = KeyPair(prvk);
      expect(kp.getPrivateKey()).to.be.equal(prvk);
    });

  });

  describe('#getPublicKey', function() {

    it('should use the private key supplied if provided', function() {
      var kp = KeyPair(prvk);
      expect(kp.getPublicKey()).to.be.equal(pubk);
    });

  });

  describe('#getNodeID', function() {

    it('should return a bitcoin compatible address', function() {
      var addr = KeyPair().getNodeID();
      expect(addr.length).to.equal(40);
    });

  });

  describe('#getAddress', function() {

    it('should return a bitcoin compatible address', function() {
      var addr = KeyPair().getAddress();
      expect(addr.length).to.be.lte(35);
      expect(addr.length).to.be.gte(26);
      expect(['1', '3']).to.include(addr.charAt(0));
    });

  });

});
