'use strict';

var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');
var Network = require('../lib/network');

describe('Network/Protocol', function() {

  var protocol = null;
  var network = new Network(new KeyPair(), {
    loglevel: 0,
    seeds: [],
    datadir: null,
    contact: {
      address: '127.0.0.1',
      port: 4000,
    }
  });

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      protocol = new Network.Protocol(network);
      expect(protocol).to.be.instanceof(Network.Protocol);
    });

  });

});
