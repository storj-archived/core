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
var stream = require('readable-stream');
var EventEmitter = require('events').EventEmitter;

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

  describe('#isHexaString', function() {
    it('returns false for object', function() {
      expect(utils.isHexaString({})).to.equal(false);
    });

    it('returns false for number', function() {
      expect(utils.isHexaString(123456789)).to.equal(false);
    });

    it('returns false for function', function() {
      expect(utils.isHexaString(function(){})).to.equal(false);
    });

    it('returns false for json string', function() {
      expect(utils.isHexaString('{"hello": "world"}')).to.equal(false);
    });

    it('returns false for base64 string', function() {
      expect(utils.isHexaString('+rx4I0qmXs+I8TYn')).to.equal(false);
    });

    it('returns false for any string with non-base16 characters', function() {
      ['g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
       'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '!', '@',
       '#', '$', '%', '^', '&', '*', '(', ')', 'G', 'H', 'I',
       'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
       'U', 'V', 'W', 'X', 'Y', 'Z', '\'', '"'].forEach((a) => {
         expect(utils.isHexaString(a)).to.equal(false);
       });
    });

    it('returns true for hexadecimal string (lowercase)', function() {
      expect(utils.isHexaString('0123456789abcdef')).to.equal(true);
    });

    it('returns true for hexadecimal string (uppercase)', function() {
      expect(utils.isHexaString('0123456789ABCDEF')).to.equal(true);
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

    it('should convert from mebibytes', function() {
      expect(utils.toNumberBytes('250', 'MiB')).to.equal(262144000);
    });

    it('should convert from gibibytes', function() {
      expect(utils.toNumberBytes('500', 'GiB')).to.equal(536870912000);
    });

    it('should convert from tebibytes', function() {
      expect(utils.toNumberBytes('2', 'TiB')).to.equal(2199023255552);
    });

    it('should convert from megabytes', function() {
      expect(utils.toNumberBytes('250', 'MB')).to.equal(250000000);
    });

    it('should convert from gigabytes', function() {
      expect(utils.toNumberBytes('500', 'GB')).to.equal(500000000000);
    });

    it('should convert from terabytes', function() {
      expect(utils.toNumberBytes('2', 'TB')).to.equal(2000000000000);
    });

    it('should throw if bad unit', function() {
      expect(function() {
        utils.toNumberBytes('1000', 'KB');
      }).to.throw(Error, 'Unit must be one of TB, TiB, GB, GiB, MB or MiB');
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

  describe('#isValidHDNodeKey', function() {

    it('will return false for a number', function() {
      expect(utils.isValidHDNodeKey(10000)).to.equal(false);
    });

    it('will return false for object literal', function() {
      expect(utils.isValidHDNodeKey({})).to.equal(false);
    });

    it('will return false for non-base58 characters', function() {
      var hdKey = 'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWg' +
          'P6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDn0';
      expect(utils.isValidHDNodeKey(hdKey)).to.equal(false);
    });

    it('will return true for extended public key string', function() {
      var hdKey = 'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWg' +
          'P6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw';
      expect(utils.isValidHDNodeKey(hdKey)).to.equal(true);
    });
  });

  describe('#isValidNodeIndex', function() {

    it('will return false for NaN', function() {
      expect(utils.isValidNodeIndex(NaN)).to.equal(false);
    });

    it('will return false for Infinity', function() {
      expect(utils.isValidNodeIndex(Infinity)).to.equal(false);
    });

    it('will return false for number greater than 2 ^ 31 - 1', function() {
      expect(utils.isValidNodeIndex(Math.pow(2, 31))).to.equal(false);
    });

    it('will return false for number less than zero', function() {
      expect(utils.isValidNodeIndex(-10000)).to.equal(false);
    });

    it('will return true for => 0 and <= 2 ^ 31 - 1', function() {
      expect(utils.isValidNodeIndex(Math.pow(2, 31) - 1)).to.equal(true);
    });

  });

  describe('#createComplexKeyFromSeed', function() {

    it('should return the expected extended key', function() {
      var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
        'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
        'ce8af';
      var seedBuffer = new Buffer(seed, 'hex');
      var expectedKey = 'xprv9xJ62Jwpr14Bbz63pamJV4Z3qT67JfqddRW55LR2bUQ38jt' +
        'y7G2TSVkE5Ro8yYZjrJGVhN8Z3qvmM9XWgGvyceNMUj7xozR4LZS1eEFP5W3';
      expect(utils.createComplexKeyFromSeed(seedBuffer)).to.equal(expectedKey);
    });

  });

  describe('#createShardDownloader', function() {

    it('should return a readable stream object', function(done) {
      var requestObj = new EventEmitter();
      var utils = proxyquire('../lib/utils', {
        http: {
          get: function(opts) {
            expect(opts.path).to.equal('/shards/hash?token=token');
            return requestObj;
          }
        }
      });
      let download = utils.createShardDownloader(
        { address: 'farmer.host', port: 6666 },
        'hash',
        'token'
      );
      expect(download).to.be.instanceOf(stream.Readable);
      download.once('data', () => done());
      setImmediate(() => {
        let res = new EventEmitter();
        requestObj.emit('response', res);
        setTimeout(() => {
          res.emit('data', Buffer.from('somedata'));
        }, 30);
      });
    });

  });

  describe('#createShardUploader', function() {

    it('should return a bubble error', function(done) {
      var requestObj = new EventEmitter();
      requestObj.write = sinon.stub();
      var utils = proxyquire('../lib/utils', {
        http: {
          request: function(opts) {
            expect(opts.method).to.equal('POST');
            expect(opts.path).to.equal(
              '/shards/hash?token=token'
            );
            return requestObj;
          }
        }
      });
      let upload = utils.createShardUploader(
        { address: 'farmer.host', port: 6666 },
        'hash',
        'token'
      );
      expect(upload).to.be.instanceOf(stream.Transform);
      upload.on('error', (err) => {
        expect(err.message).to.equal('Failed');
        done();
      });
      upload.write(Buffer.from([]));
      setImmediate(() => {
        requestObj.emit('error', new Error('Failed'));
      });
    });

    it('should return a transform stream', function(done) {
      var requestObj = new EventEmitter();
      requestObj.write = sinon.stub().callsArg(2);
      requestObj.end = sinon.stub();
      var utils = proxyquire('../lib/utils', {
        http: {
          request: function(opts) {
            expect(opts.method).to.equal('POST');
            expect(opts.path).to.equal(
              '/shards/hash?token=token'
            );
            return requestObj;
          }
        }
      });
      let upload = utils.createShardUploader(
        { address: 'farmer.host', port: 6666 },
        'hash',
        'token'
      );
      expect(upload).to.be.instanceOf(stream.Transform);
      upload.on('finish', done);
      setTimeout(() => {
        upload.write(Buffer.from('somedata'));
        upload.end();
      }, 30);
    });

  });

  describe('#warnOnError', function() {

    it('should return a callback function that logs error', function(done) {
      var _warn = sinon.stub();
      var callback= utils.warnOnError({ warn: _warn });
      callback(new Error('Something failed'));
      setImmediate(() => {
        expect(_warn.called).to.equal(true);
        done();
      });
    });

    it('should return a callback function that does nothing', function(done) {
      var _warn = sinon.stub();
      var callback= utils.warnOnError({ warn: _warn });
      callback(null);
      setImmediate(() => {
        expect(_warn.called).to.equal(false);
        done();
      });
    });

  });

});
