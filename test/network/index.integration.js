'use strict';

var expect = require('chai').expect;
var async = require('async');
var sinon = require('sinon');
var storj = require('../../');
var kad = require('kad');
var Contract = require('../../lib/contract');
var AuditStream = require('../../lib/audit-tools/audit-stream');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');
var DataChannelClient = require('../../lib/data-channels/client');
var StorageItem = require('../../lib/storage/item');
var Verification = require('../../lib/audit-tools/verification');
var DataChannelPointer = require('../../lib/data-channels/pointer');
var path = require('path');
var os = require('os');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var crypto = require('crypto');

kad.constants.T_RESPONSETIMEOUT = 2000;

var NODE_LIST = [];
var STARTING_PORT = 64535;
var TMP_DIR = path.join(os.tmpdir(), 'STORJ_INTEGRATION_TESTS-NET');

var _ntp = null;

function createNode(opcodes, tunnels, callback) {
  var node = null;
  var kp = new storj.KeyPair();
  var adapter = new storj.EmbeddedStorageAdapter(
    path.join(TMP_DIR, crypto.randomBytes(32).toString('hex')),
    'createNode'
  );
  var manager = new storj.StorageManager(adapter);
  var port = STARTING_PORT--;

  var options = {
    keypair: kp,
    manager: manager,
    logger: kad.Logger(
      0,
      (opcodes.length ? 'farmer-' : 'renter-') + kp.getNodeID()
    ),
    seeds: NODE_LIST.length ? [NODE_LIST[0]] : NODE_LIST,
    address: '127.0.0.1',
    port: port,
    opcodes: opcodes,
    noforward: true,
    tunnels: tunnels,
    tunport: 0,
    storage: {
      path: path.join(TMP_DIR, crypto.randomBytes(32).toString('hex'))
    }
  };

  if (opcodes.length) {
    node = storj.FarmerInterface(options);
    node.manager._storage.once('ready', function() {
      console.log('firing callback for farmer')
      callback(null, node);
    });
  } else {
    node = storj.RenterInterface(options);
    adapter.once('ready', function() {
      console.log('firing callback for renter')
      callback(null, node);
    });
  }

  NODE_LIST.push([
    'storj://127.0.0.1:', port, '/', kp.getNodeID()
  ].join(''));
}

function createRenter(callback) {
  return createNode([], 3, callback);
}

function createFarmer(callback) {
  return createNode(['0f01010202'], 0, callback);
}

var renters = [];
var farmers = [];
var contract = null;
var farmer = null;
var shard = new Buffer('hello storj');
var audit = new AuditStream(12);
var ctoken = null;
var rtoken = null;
var renter;

before(function(done) {
  if (storj.utils.existsSync(TMP_DIR)) {
    rimraf.sync(TMP_DIR);
  }
  mkdirp.sync(TMP_DIR);
  async.times(2, function(n, next) {
    createFarmer(function(err, farmer) {
      farmers.push(farmer);
      console.log('created farmer')
      next();
    });
  }, function() {
    async.times(1, function(n, next) {
      createRenter(function(err, renter) {
        renters.push(renter);
        console.log('created renter')
        next();
      });
    }, function() {
      renter = renters[renters.length - 1];
      done();
    });
  });
});

describe('Network/Integration/Tunnelling', function() {

  before(function(done) {
    this.timeout(35000);
    var _requestProbeCalled = false;

    _ntp = sinon.stub(utils, 'ensureNtpClockIsSynchronized').callsArgWith(
      0,
      null
    );

    sinon.stub(farmers[0], '_requestProbe', function(c, cb) {
      if (!_requestProbeCalled) {
        _requestProbeCalled = true;
        return cb(new Error('Probe failed'));
      }
      cb(null, {});
    }); // NB: Force tunneling

    async.each(renters, function(node, next) {
      node.transport._isPublic = true;
      node.join(function noop() {});
      next();
    }, function() {
      farmers[0].transport._isPublic = false;
      farmers[0].join(function() {
        audit.end(shard);
        farmers[1].transport._isPublic = false;
        farmers[1].join(function() {
          done();
        });
      });
    });
  });

  describe('#getStorageOffer', function() {

    it('should receive an offer for the published contract', function(done) {
      this.timeout(12000);
      contract = new Contract({
        renter_id: renter.keypair.getNodeID(),
        data_size: shard.length,
        data_hash: utils.rmd160sha256(shard),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      renter.getStorageOffer(contract, function(err, _farmer, _contract) {
        expect(_farmer).to.be.instanceOf(Contact);
        expect(_contract).to.be.instanceOf(Contract);
        contract = _contract;
        farmer = _farmer;
        done();
      });
    });

  });

  describe('#getConsignToken', function() {

    it('should be issued an consign token from the farmer', function(done) {
      this.timeout(6000);
      renter.getConsignToken(farmer, contract, audit, function(err, token) {
        expect(err).to.equal(null);
        expect(typeof token).to.equal('string');
        ctoken = token;
        done();
      });
    });

    after(function(done) {
      var dcx = DataChannelClient(farmer);
      dcx.on('open', function() {
        var stream = dcx.createWriteStream(ctoken, utils.rmd160sha256(shard));
        stream.on('finish', function() {
          done();
        }).on('error', function(err) {
          done(err);
        });
        stream.write(shard);
        stream.end();
      });
    });

  });

  describe('#getRetrieveToken', function() {

    it('should be issued a retrieve token from the farmer', function(done) {
      renter.getRetrieveToken(farmer, contract, function(err, token) {
        expect(err).to.equal(null);
        expect(typeof token).to.equal('string');
        rtoken = token;
        done();
      });
    });

    after(function(done) {
      var dcx = DataChannelClient(farmer);
      dcx.on('open', function() {
        var stream = dcx.createReadStream(rtoken, utils.rmd160sha256(shard));
        stream.on('end', done).on('error', done);
        stream.on('data', function(chunk) {
          expect(Buffer.compare(chunk, shard)).to.equal(0);
        });
      });
    });

  });

  describe('#getStorageProof', function() {

    it('should get the proof response from the farmer', function(done) {
      var itemdata = {
        shard: null,
        hash: utils.rmd160sha256(shard),
        contracts: {},
        challenges: {}
      };
      itemdata.contracts[farmer.nodeID] = contract.toObject();
      itemdata.challenges[farmer.nodeID] = audit.getPrivateRecord();
      var item = new StorageItem(itemdata);
      renter.getStorageProof(farmer, item, function(err, proof) {
        var v = Verification(proof).verify(
          audit.getPrivateRecord().root,
          audit.getPrivateRecord().depth
        );
        expect(v[0]).to.equal(v[1]);
        done();
      });
    });

  });

  describe('#getMirrorNodes', function() {

    before(function(done) {
      this.timeout(10000);
      done();
    });

    it('should get successful mirrors', function(done) {
      this.timeout(12000);
      kad.constants.T_RESPONSETIMEOUT = 6000;
      renter.getStorageOffer(contract, [
        farmer.nodeID
      ], function(err, _farmer) {
        expect(err).to.equal(null);
        renter.getRetrieveToken(farmer, contract, function(err, token) {
          expect(err).to.equal(null);
          var pointers = [new DataChannelPointer(
            _farmer,
            contract.get('data_hash'),
            token,
            'PULL'
          )];
          renter.getMirrorNodes(pointers, [_farmer], function(err, nodes) {
            expect(nodes).to.have.lengthOf(1);
            done();
          });
        });
      });
    });

  });

  after(function() {
    _ntp.restore();
  });

});

after(function() {
  rimraf.sync(TMP_DIR);
});
