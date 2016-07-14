'use strict';

var Network = require('../../lib/network');
var Monitor = require('../../lib/network/monitor');
var expect = require('chai').expect;
var kad = require('kad');
var Manager = require('../../lib/manager');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var KeyPair = require('../../lib/keypair');

describe('Network/Monitor', function() {

  describe('@constructor', function() {

    var net = new Network({
      keypair: new KeyPair(),
      manager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      port: 1234
    });

    it('should create an instance without the new keyword', function() {
      expect(Monitor(net)).to.be.instanceOf(Monitor);
    });

    it('should create an instance with the new keyword', function() {
      expect(new Monitor(net)).to.be.instanceOf(Monitor);
    });

  });

});
