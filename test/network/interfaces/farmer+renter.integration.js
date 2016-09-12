'use strict';

var expect = require('chai').expect;
var async = require('async');
var kad = require('kad');
var sinon = require('sinon');
var Contract = require('../../../lib/contract');
var AuditStream = require('../../../lib/audit-tools/audit-stream');
var Contact = require('../../../lib/network/contact');
var utils = require('../../../lib/utils');
var DataChannelClient = require('../../../lib/data-channels/client');
var StorageItem = require('../../../lib/storage/item');
var Verification = require('../../../lib/audit-tools/verification');
var KeyPair = require('../../../lib/crypto-tools/keypair');
var Manager = require('../../../lib/storage/manager');
var EmbeddedStorageAdapter = require('../../../lib/storage/adapters/embedded');
var FarmerInterface = require('../../../lib/network/interfaces/farmer');
var RenterInterface = require('../../../lib/network/interfaces/renter');
var path = require('path');
var os = require('os');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var crypto = require('crypto');
var async = require('async');

kad.constants.T_RESPONSETIMEOUT = 5000;

var NODE_LIST = [];
var STARTING_PORT = 65535;
var TMP_DIR = path.join(os.tmpdir(), 'STORJ_INTEGRATION_TESTS-IFACES');

var _ntp = null;

function createNode(opcodes, callback) {
  var node = null;
  var kp = new KeyPair();
  var adapter = new EmbeddedStorageAdapter(
    path.join(TMP_DIR, crypto.randomBytes(32).toString('hex'))
  );
  var manager = new Manager(adapter);
  var port = STARTING_PORT--;

  var options = {
    keypair: kp,
    manager: manager,
    logger: kad.Logger(0),
    seeds: NODE_LIST.slice(),
    address: '127.0.0.1',
    port: port,
    tunport: 0,
    opcodes: opcodes,
    noforward: true,
    bridge: false
  };

  if (opcodes.length) {
    node = FarmerInterface(options);
  } else {
    node = RenterInterface(options);
  }

  NODE_LIST.push([
    'storj://127.0.0.1:', port, '/', kp.getNodeID()
  ].join(''));

  adapter.on('ready', function() {
    callback(null, node);
  });
}

function createRenter(cb) {
  return createNode([], cb);
}

function createFarmer(cb) {
  return createNode(['0f01010202'], cb);
}

var farmers = [];
var renters = [];

var contract = null;
var farmer = null;
var shard = new Buffer('hello storj');
var audit = new AuditStream(12);
var ctoken = null;
var rtoken = null;
var renter;

before(function(done) {
  if (utils.existsSync(TMP_DIR)) {
    rimraf.sync(TMP_DIR);
  }
  mkdirp.sync(TMP_DIR);
  async.times(2, function(n, next) {
    createFarmer(function(err, farmer) {
      farmers.push(farmer);
      next();
    });
  }, function() {
    async.times(2, function(n, next) {
      createRenter(function(err, renter) {
        renters.push(renter);
        next();
      });
    }, function() {
      renter = renters[renters.length - 1];
      done();
    });
  });
});

describe('Interfaces/Farmer+Renter/Integration', function() {

  before(function(done) {
    _ntp = sinon.stub(utils, 'ensureNtpClockIsSynchronized').callsArgWith(
      0,
      null
    );
    audit.end(shard);
    setImmediate(done);
  });

  describe('#join', function() {

    it('should connect all the nodes together', function(done) {
      this.timeout(35000);
      farmers[0].join(function() {
        farmers.shift();
        async.each(farmers.concat(renters), function(node, next) {
          node.join(next);
        }, done);
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
        stream.on('finish', done);
        stream.write(shard);
        stream.end();
      });
    });

  });

  describe('#getRetrieveToken', function() {

    it('should be issued an retrieve token from the farmer', function(done) {
      this.timeout(6000);
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
        stream.on('end', done);
        stream.on('data', function(chunk) {
          expect(Buffer.compare(chunk, shard)).to.equal(0);
        });
      });
    });

  });

  describe('#getStorageProof', function() {

    it('should get the proof response from the farmer', function(done) {
      this.timeout(6000);
      var itemdata = {
        shard: shard,
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

  after(function() {
    _ntp.restore();
  });

});

after(function() {
  rimraf.sync(TMP_DIR);
});
