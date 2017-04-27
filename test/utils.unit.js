'use strict';

const { expect } = require('chai');
const utils = require('../lib/utils');
const semver = require('semver');
const version = require('../lib/version');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const constants = require('../lib/constants');
const stream = require('readable-stream');
const { EventEmitter } = require('events');

describe('@module utils', function() {

  describe('#rmd160sha256b', function() {
    it('will give digest as buffer', function() {
      const digest = utils.rmd160sha256b('hello, world', 'utf8');
      expect(Buffer.isBuffer(digest)).to.equal(true);
      expect(digest.toString('hex'))
        .to.equal('cf7c332804ab8ae1df7d7cbe7517b82edb83c680');
    });

    it('will give digest as hex string', function() {
      const digest = utils.rmd160sha256('hello, world', 'utf8');
      expect(digest).to.be.a('string');
      expect(digest)
        .to.equal('cf7c332804ab8ae1df7d7cbe7517b82edb83c680');
    });
  });

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

    it('should be compatible (different minor)', function() {
      expect(
        utils.isCompatibleVersion(semver.inc(version.protocol, 'minor'))
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
      [ 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
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

});
