'use strict';

var expect = require('chai').expect;
var utils = require('../lib/utils');
var semver = require('semver');
var version = require('../lib/version');
var KeyPair = require('../lib/crypto-tools/keypair');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var constants = require('../lib/constants');
var os = require('os');

describe('utils', function() {
  /* jshint maxstatements: false */

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

  describe('#sha1whirlpool', function() {

    it('should return the hex encoded hash', function() {
      expect(utils.sha1whirlpool('test')).to.equal(
        '43144cac0a406eb72f4d3be7292438ac15725e1d'
      );
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

  describe('#toNumberBytes', function() {

    it('should convert from megabytes', function() {
      expect(utils.toNumberBytes('250', 'MB')).to.equal(262144000);
    });

    it('should convert from gigabytes', function() {
      expect(utils.toNumberBytes('500', 'GB')).to.equal(536870912000);
    });

    it('should convert from terabytes', function() {
      expect(utils.toNumberBytes('2', 'TB')).to.equal(2199023255552);
    });

    it('should throw if bad unit', function() {
      expect(function() {
        utils.toNumberBytes('1024', 'KB');
      }).to.throw(Error, 'Unit must be one of TB, GB, or MB');
    });

  });

  describe('#simpleEncrypt + #simpleDecrypt', function() {

    it('should successfully encrypt and decrypt the data', function() {
      var data = 'hello world';
      var enc = utils.simpleEncrypt('password', data);
      var dec = utils.simpleDecrypt('password', enc);
      expect(dec).to.equal(data);
    });

  });

  describe('#getNtpTimeDelta', function() {

    it('should bubble errors from the ntp client', function(done) {
      var stubbedUtils = proxyquire('../lib/utils', {
        'ntp-client': {
          getNetworkTime: sinon.stub().callsArgWith(
            2,
            new Error('Time paradox occurred')
          )
        }
      });
      stubbedUtils.getNtpTimeDelta(function(err) {
        expect(err.message).to.equal('Time paradox occurred');
        done();
      });
    });

  });

  describe('#ensureNtpClockIsSynchronized', function() {

    it('should bubble errors from the ntp client', function(done) {
      var stubbedUtils = proxyquire('../lib/utils', {
        'ntp-client': {
          getNetworkTime: sinon.stub().callsArgWith(
            2,
            new Error('Time paradox occurred')
          )
        }
      });
      stubbedUtils.ensureNtpClockIsSynchronized(function(err) {
        expect(err.message).to.equal('Time paradox occurred');
        done();
      });
    });

    it('should error is delta is greater than NONCE_EXPIRE', function(done) {
      var time = new Date();
      time.setTime(time.getTime() + constants.NONCE_EXPIRE + 2000);
      var stubbedUtils = proxyquire('../lib/utils', {
        'ntp-client': {
          getNetworkTime: sinon.stub().callsArgWith(2, null, time)
        }
      });
      stubbedUtils.ensureNtpClockIsSynchronized(function(err) {
        expect(err.message).to.equal(
          'System clock is not syncronized with NTP'
        );
        done();
      });
    });

    it('should return no error if delta is within range', function(done) {
      var time = new Date();
      time.setTime(time.getTime() + constants.NONCE_EXPIRE - 2000);
      var stubbedUtils = proxyquire('../lib/utils', {
        'ntp-client': {
          getNetworkTime: sinon.stub().callsArgWith(2, null, time)
        }
      });
      stubbedUtils.ensureNtpClockIsSynchronized(function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#createStreamTrimmer', function() {

    it('should trim the stream to the specified length', function(done) {
      var noise = require('noisegen')({
        length: 5 * (1024 * 1024),
        size: 64 * 1024
      });
      var trimmer = utils.createStreamTrimmer(100 * 1024, 1024 * 1024);
      var bytes = 0;

      noise.pipe(trimmer).on('data', function(data) {
        bytes += data.length;
      }).on('end', function() {
        expect(bytes).to.equal(1024 * 1024);
        done();
      });
    });

  });

  describe('#tmpdir', function() {

    it('should default to os.tmpdir', function() {
      process.env.STORJ_TEMP = '';
      expect(utils.tmpdir()).to.equal(os.tmpdir());
    });

    it('should use STORJ_TEMP env if set', function() {
      process.env.STORJ_TEMP = '/path/to/temp';
      var _existsSync = sinon.stub(utils, 'existsSync', function() {
        return true;
      });
      expect(utils.tmpdir()).to.equal('/path/to/temp');
      _existsSync.restore();
    });

  });

  describe('#isDirectory', function() {

    it('should return false if not a directory', function() {
      expect(utils.isDirectory('not a directory')).to.equal(false);
    });

    it('should return true if the path is a directory', function() {
      expect(utils.isDirectory(__dirname)).to.equal(true);
    });

  });

  var testIdCalculation = function(){

    var user = 'user@domain.tld';
    var bucketName = 'New Bucket';
    var fileName = 'test.txt';

    var bucketId = 'd0c9ac287f89dac76deadfad';
    var fileId = 'c32ec64da2bf278caec65feb';

    describe('#calculateBucketId', function() {

      it('should return the correct hex encoded hash', function() {
        expect(utils.calculateBucketId(user, bucketName))
          .to.equal(bucketId);
      });

    });

    describe('#calculateFileId', function() {

      it('should return the correct hex encoded hash', function() {
        expect(utils.calculateFileId(bucketId, fileName))
          .to.equal(fileId);
      });

    });

    describe('#calculateFileIdByName', function() {

      it('should return the correct hex encoded hash', function() {
        expect(utils.calculateFileIdByName(user, bucketName, fileName))
          .to.equal(fileId);
      });

    });

  };

  testIdCalculation();

  describe('#isValidHDNodeID', function() {

    it('will return false for a number', function() {
      expect(utils.isValidHDNodeKey(10000)).to.equal(false);
    });

    it('will return false for object literal', function() {
      expect(utils.isValidHDNodeKey({})).to.equal(false);
    });

    it('will return true for extended public key string', function() {
      var extendedPublicKey = 'spubXxUvVaAHwFoktwTozj4fZfK7zBdWobvXdi3T9Ujh89' +
          'g3gsQNheGGhgi9twKBGaqgHuhUHX7aM8kPTWSkRLT9TqyQWdhwWZfUstxULsmXuDc5';
      expect(utils.isValidHDNodeKey(extendedPublicKey)).to.equal(true);
    });
  });

  describe('#isValidInt32', function() {

    it('will return false for NaN', function() {
      expect(utils.isValidInt32(NaN)).to.equal(false);
    });

    it('will return false for Infinity', function() {
      expect(utils.isValidInt32(Infinity)).to.equal(false);
    });

    it('will return false for number greater than 2 ^ 32 - 1', function() {
      expect(utils.isValidInt32(Math.pow(2, 32))).to.equal(false);
    });

    it('will return false for number less than zero', function() {
      expect(utils.isValidInt32(Math.pow(2, 32))).to.equal(false);
    });

    it('will return true for > 0 and < 2 ^ 32 - 1', function() {
      expect(utils.isValidInt32(Math.pow(2, 32) - 1)).to.equal(true);
    });
  });

});
