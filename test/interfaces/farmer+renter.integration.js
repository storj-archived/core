'use strict';

// TODO: Replace (or supplement) these integration tests with unit tests
// TODO: when we have more time to do so.

var expect = require('chai').expect;
var async = require('async');
var os = require('os');
var fs = require('fs');
var path = require('path');
var storj = require('../../');
var kad = require('kad');
var ms = require('ms');

var NODE_LIST = [];
var STARTING_PORT = 65535;

function createNode(opcodes) {
  var node = null;
  var kp = new storj.KeyPair();
  var manager = new storj.Manager(new storj.RAMStorageAdapter());
  var datadir = path.join(os.tmpdir(), kp.getNodeID());
  var port = STARTING_PORT--;

  fs.mkdirSync(datadir);

  var options = {
    keypair: kp,
    manager: manager,
    logger: kad.Logger(0),
    seeds: NODE_LIST.length ? [NODE_LIST[0]] : NODE_LIST,
    address: '127.0.0.1',
    port: port,
    opcodes: opcodes,
    noforward: true
  };

  if (opcodes.length) {
    node = storj.FarmerInterface(options);
  } else {
    node = storj.RenterInterface(options);
  }

  NODE_LIST.push([
    'storj://127.0.0.1:', port, '/', kp.getNodeID()
  ].join(''));

  return node;
}

function createRenter() {
  return createNode([]);
}

function createFarmer() {
  return createNode(['0f01010202']);
}

describe('Interfaces/Farmer+Renter/Integration', function() {

  var data = new Buffer('ALL THE SHARDS');
  var hash = storj.utils.rmd160sha256(data);

  var farmers = Array.apply(null, Array(1)).map(function() {
    return createFarmer();
  });
  var renters = Array.apply(null, Array(2)).map(function() {
    return createRenter();
  });

  describe('#join', function() {

    it('should connect all the nodes together', function(done) {
      this.timeout(5000);
      farmers[0].join(function() {
        farmers.shift();
        async.eachSeries(farmers.concat(renters), function(node, done) {
          node.join(done);
        }, done);
      });
    });

  });

  describe('#store', function() {

    it('should negotiate a storage contract with a farmer', function(done) {
      this.timeout(12000);
      var renter = renters[renters.length - 1];
      var duration = ms('20s');
      renter.store(data, duration, function(err, key) {
        expect(err).to.equal(null);
        expect(key).to.equal(hash);
        done();
      });
    });

  });


  describe('#retrieve', function() {

    it('should fetch the file from the farmer', function(done) {
      var renter = renters[renters.length - 1];
      var buffer = Buffer([]);
      renter.retrieve(hash, function(err, result) {
        expect(err).to.equal(null);
        result.on('end', function() {
          expect(Buffer.compare(data, buffer)).to.equal(0);
          done();
        });
        result.on('data', function(data) {
          buffer = Buffer.concat([buffer, data]);
        });
      });
    });

  });


  describe('#audit', function() {

    it('should successfully audit the stored data', function(done) {
      var renter = renters[renters.length - 1];
      renter.audit(hash, function(err, result) {
        expect(err).to.equal(null);
        expect(result[0]).to.equal(result[1]);
        done();
      });
    });

  });

});
