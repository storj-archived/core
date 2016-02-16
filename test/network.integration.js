'use strict';

// TODO: Replace (or supplement) these integration tests with unit tests
// TODO: when we have more time to do so.

var expect = require('chai').expect;
var async = require('async');
var os = require('os');
var fs = require('fs');
var path = require('path');
var storj = require('..');

var NODE_LIST = [];
var STARTING_PORT = 65535;

function createNode(farming) {
  var kp = new storj.KeyPair();
  var datadir = path.join(os.tmpdir(), kp.getNodeID());
  var contact = { address: '127.0.0.1', port: STARTING_PORT-- };

  fs.mkdirSync(datadir);

  var node = new storj.Network(kp, {
    loglevel: 2,
    seeds: NODE_LIST.length ? [NODE_LIST[0]] : NODE_LIST,
    datadir: datadir,
    contact: contact,
    farmer: farming
  });
  NODE_LIST.push([
    'storj://', contact.address, ':', contact.port, '/', kp.getNodeID()
  ].join(''));
  return node;
}

function createRenter() {
  return createNode(false);
}

function createFarmer() {
  return createNode(true);
}

describe('Storj/Integration', function() {

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
      this.timeout(8000);
      var renter = renters[renters.length - 1];
      var duration = '20s';
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
      renter.retrieve(hash, function(err, result) {
        expect(err).to.equal(null);
        expect(Buffer.compare(data, result)).to.equal(0);
        done();
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
