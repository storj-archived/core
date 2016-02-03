'use strict';

var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');

describe('KeyPair', function() {

  describe('@constructor', function() {

    it('should work without the new keyword', function() {
      expect(KeyPair()).to.be.instanceOf(KeyPair);
    });

    it('should use the private key supplied if provided', function() {
      var k = '5d9a5344a02a8640eec11d0a76850ffe1f9c0a7760fd0a930716a2ffd06475e';
      var kp = KeyPair(k);
      expect(kp.getPrivateKey().toString('hex')).to.be.equal(k);
    });

  });

});
