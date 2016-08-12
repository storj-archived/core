'use strict';

var expect = require('chai').expect;
var KeyPair = require('../../lib/crypto-tools/keypair');
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

  describe('#sign', function() {

    var k = 'd1b1d083ddbcf92aa665a77379a0e32ef7cc5a4ccfc4b2a30214ebcdfd34d846';
    var m = 'a test message';

    it('should return a bitcoin-style compact signature', function() {
      var keypair = new KeyPair(k);
      var signature = keypair.sign(m, { compact: true });
      expect(signature).to.have.lengthOf(88);
    });

    it('should return a regular hex signature from string', function() {
      var keypair = new KeyPair(k);
      var signature = keypair.sign(m, { compact: false });
      expect(signature).to.equal(
        '3045022100fc2cc9dcfa01fef0c8c78942f057f6d2930e9308bd5e43072c56098' +
        '34d938cad022007f1179aace5810c9c4ba0461980aa2bcdfac6a40a900443b018' +
        'b09e5ced5e1f'
      );
    });

    it('should return a regular hex signature from buffer', function() {
      var keypair = new KeyPair(k);
      var signature = keypair.sign(Buffer(m), { compact: false });
      expect(signature).to.equal(
        '3045022100fc2cc9dcfa01fef0c8c78942f057f6d2930e9308bd5e43072c56098' +
        '34d938cad022007f1179aace5810c9c4ba0461980aa2bcdfac6a40a900443b018' +
        'b09e5ced5e1f'
      );
    });

  });

});
