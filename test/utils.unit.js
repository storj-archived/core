'use strict';

var expect = require('chai').expect;
var utils = require('../lib/utils');
var semver = require('semver');
var version = require('../lib/version');
var KeyPair = require('../lib/keypair');

describe('utils', function() {

  describe('#getContactURL', function() {

    it('should return the proper URI format of the contact', function() {
      expect(utils.getContactURL({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '7a728a8c27fa378cafbd300c1e38639362f87ee8'
      })).to.equal(
        'storj://127.0.0.1:1337/7a728a8c27fa378cafbd300c1e38639362f87ee8'
      );
    });

  });

  describe('#isCompatibleVersion', function() {

    it('should be compatible (same version)', function() {
      expect(utils.isCompatibleVersion(version.protocol)).to.equal(true);
    });

    it('should not be compatible (different major)', function() {
      expect(utils.isCompatibleVersion('999.0.0')).to.equal(false);
    });

    it('should be compatible (different patch)', function() {
      expect(
        utils.isCompatibleVersion(semver.inc(version.protocol, 'patch'))
      ).to.equal(true);
    });

    it('should not be compatible (different build tag)', function() {
      expect(
        utils.isCompatibleVersion(version.protocol + '-buildtag')
      ).to.equal(false);
    });

  });

  describe('#isValidContact', function() {

    it('should allow loopback iface if enabled', function() {
      expect(utils.isValidContact({
        address: '127.0.0.1',
        port: 1337
      }, true)).to.equal(true);
    });

    it('should not allow loopback iface if disabled', function() {
      expect(utils.isValidContact({
        address: '127.0.0.1',
        port: 1337
      })).to.equal(false);
    });

    it('should allow valid public address', function() {
      expect(utils.isValidContact({
        address: '104.200.143.243',
        port: 1337
      })).to.equal(true);
    });

    it('should allow valid public hostname', function() {
      expect(utils.isValidContact({
        address: 'some.domain.name',
        port: 1337
      })).to.equal(true);
    });

    it('should allow valid port', function() {
      expect(utils.isValidContact({
        address: 'some.domain.name',
        port: 80
      })).to.equal(true);
    });

    it('should not allow invalid port', function() {
      expect(utils.isValidContact({
        address: 'some.domain.name',
        port: 0
      })).to.equal(false);
    });

    it('should return false if no contact is supplied', function() {
      expect(utils.isValidContact(null)).to.equal(false);
    });

  });

  describe('#createEciesCipher', function() {

    it('should encrypt the message to the given key', function() {
      var bob = new KeyPair();
      var alice = new KeyPair();
      var incipher = utils.createEciesCipher(
        bob.getPrivateKey(),
        alice.getPublicKey()
      );
      var encmessage = incipher.encrypt('HELLO STORJ');
      var outcipher = utils.createEciesCipher(
        alice.getPrivateKey(),
        bob.getPublicKey()
      );
      var decmessage = outcipher.decrypt(encmessage);
      expect(decmessage.toString()).to.equal('HELLO STORJ');
    });

  });

});
