'use strict';

var os = require('os');
var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');
var Network = require('../lib/network');
var Protocol = require('../lib/network/protocol');
var Manager = require('../lib/manager');
var RAMStorage = require('../lib/storage/adapters/ram');

describe('Network/Protocol', function() {

  var protocol = null;
  var network = new Network({
    keypair: new KeyPair(),
    manager: new Manager(new RAMStorage()),
    loglevel: 0,
    seeds: [],
    datadir: os.tmpdir(),
    contact: {
      address: '127.0.0.1',
      port: 4000,
    }
  });

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      protocol = new Protocol({
        network: network
      });
      expect(protocol).to.be.instanceof(Protocol);
    });

  });

});
