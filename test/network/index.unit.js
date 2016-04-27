'use strict';

var expect = require('chai').expect;
var Network = require('../../lib/network');
var Manager = require('../../lib/manager');
var KeyPair = require('../../lib/keypair');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var Logger = require('kad').Logger;

describe('Network', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      })).to.be.instanceOf(Network);
    });

  });

  describe('#_verifyMessage', function() {

    it('should fail if incompatible version', function(done) {
      var verify = Network.prototype._verifyMessage;

      verify({}, {
        protocol: '0.0.0',
        address: '127.0.0.1',
        port: 6000
      }, function(err) {
        expect(err.message).to.equal('Protocol version is incompatible');
        done();
      });
    });

  });

});
