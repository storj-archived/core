'use strict';

var expect = require('chai').expect;
var async = require('async');
var os = require('os');
var fs = require('fs');
var path = require('path');
var sinon = require('sinon');
var storj = require('../../');
var kad = require('kad');
var ms = require('ms');

var NODE_LIST = [];
var STARTING_PORT = 64535;

function createNode(opcodes, tunnels) {
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
    noforward: !!tunnels,
    tunnels: tunnels
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
  return createNode([], 3);
}

function createFarmer() {
  return createNode(['0f01010202'], 0);
}

describe('Network/Integration/Tunnelling', function() {

  var data = new Buffer('ALL THE SHARDS');
  var hash = storj.utils.rmd160sha256(data);

  var renters = Array.apply(null, Array(2)).map(function() {
    return createRenter();
  });
  var farmers = Array.apply(null, Array(1)).map(function() {
    return createFarmer();
  });

  before(function(done) {
    this.timeout(12000);
    sinon.stub(farmers[0], '_requestProbe').callsArgWith(
      1, new Error('Probe failed')
    ); // NB: Force tunneling

    async.eachSeries(renters, function(node, next) {
      node.join(next);
    }, function() {
      farmers[0]._transport._isPublic = false;
      farmers[0].join(done);
    });
  });

  describe('#store (tunneled)', function() {

    it('should negotiate contract with a tunneled farmer', function(done) {
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

  describe('#retrieve (tunneled)', function() {

    it('should fetch the file from a tunneled farmer', function(done) {
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

  describe('#audit (tunneled)', function() {

    it('should successfully audit the stored data via tunnel', function(done) {
      var renter = renters[renters.length - 1];
      renter.audit(hash, function(err, result) {
        expect(err).to.equal(null);
        expect(result[0]).to.equal(result[1]);
        done();
      });
    });

  });

  describe('Protocol#FIND_TUNNEL', function() {

    it('should ask neighbors for tunnels if not offering any', function(done) {
      var renter = renters[renters.length - 1];
      var farmer = farmers[0];
      renter._transport.send(farmer._contact, kad.Message({
        method: 'FIND_TUNNEL',
        params: { contact: renter._contact }
      }), function(err, response) {
        expect(err).to.equal(null);
        expect(response.result.tunnels).to.have.lengthOf(2);
        done();
      });
    });

  });

});
