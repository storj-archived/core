'use strict';

var expect = require('chai').expect;
var Network = require('../../lib/network');
var Manager = require('../../lib/manager');
var KeyPair = require('../../lib/keypair');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');

describe('Network', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        loglevel: 0,
        seeds: [],
        contact: { address: '127.0.0.1', port: 0 },
        farmer: false,
        noforward: true
      })).to.be.instanceOf(Network);
    });

  });



});
