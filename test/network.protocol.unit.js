'use strict';

var os = require('os');
var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');
var Network = require('../lib/network');
var Protocol = require('../lib/network/protocol');
var ShardManager = require('../lib/shard/manager');
var ContractManager = require('../lib/contract/manager');

describe('Network/Protocol', function() {

  var t = Date.now();
  var protocol = null;
  var shardman = new ShardManager(os.tmpdir() + '/shards-' + t);
  var contractman = new ContractManager(os.tmpdir() + '/contracts-' + t);
  var network = new Network(new KeyPair(), {
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
        network: network,
        shards: shardman,
        contracts: contractman
      });
      expect(protocol).to.be.instanceof(Protocol);
    });

  });

});
