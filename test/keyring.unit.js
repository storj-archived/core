'use strict';

var KeyRing = require('../lib/keyring');
var KeyPair = require('../lib/keypair');
var expect = require('chai').expect;
var path = require('path');

var tmpid1 = require('crypto').randomBytes(6).toString('hex');
var tmpfile1 = path.join(require('os').tmpdir(), tmpid1);
var tmpid2 = require('crypto').randomBytes(6).toString('hex');
var tmpfile2 = path.join(require('os').tmpdir(), tmpid2);

describe('KeyRing', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(KeyRing(tmpfile1)).to.be.instanceOf(KeyRing);
    });

    it('should create instance with the new keyword', function() {
      expect(new KeyRing(tmpfile1)).to.be.instanceOf(KeyRing);
    });

    it('should use the supplied passphrase', function() {
      KeyRing(tmpfile2, 'test');
      expect(function() {
        KeyRing(tmpfile2);
      }).to.throw(Error);
    });

  });

  describe('#generateKey', function() {

    it('should generate a keypair and return it', function() {
      var kr = new KeyRing(tmpfile1);
      expect(kr.generateKey('test')).to.be.instanceOf(KeyPair);
    });

  });

  describe('#loadKey', function() {

    it('should return null if no key for the given ID', function() {
      var kr = new KeyRing(tmpfile1);
      expect(kr.loadKey('wrong')).to.equal(null);
    });

  });

});
