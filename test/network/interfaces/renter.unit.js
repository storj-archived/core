'use strict';

var expect = require('chai').expect;
var Contract = require('../../../lib/contract');
var KeyPair = require('../../../lib/crypto-tools/keypair');
var RenterInterface = require('../../../lib/network/interfaces/renter');
var kad = require('kad');
var sinon = require('sinon');
var utils = require('../../../lib/utils');
var Contact = require('../../../lib/network/contact');
var StorageItem = require('../../../lib/storage/item');
var RAMStorageAdapter = require('../../../lib/storage/adapters/ram');
var StorageManager = require('../../../lib/storage/manager');
var AuditStream = require('../../../lib/audit-tools/audit-stream');
var DataChannelPointer = require('../../../lib/data-channels/pointer');

var CLEANUP = [];

describe('RenterInterface', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      var renter = RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        tunnelServerPort: 0,
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      expect(renter).to.be.instanceOf(RenterInterface);
    });

  });

  describe('#isAwaitingOffer', function() {

    it('should callback false if not awaiting offer', function(done) {
      RenterInterface.prototype.isAwaitingOffer.call({
        offerManager: { getStream: sinon.stub().returns(null) }
      }, 'test', function(err, isAwaiting) {
        expect(isAwaiting).to.equal(false);
        done();
      });
    });

    it('should callback true if awaiting offer', function(done) {
      RenterInterface.prototype.isAwaitingOffer.call({
        offerManager: { getStream: sinon.stub().returns({}) }
      }, 'test', function(err, isAwaiting) {
        expect(isAwaiting).to.equal(true);
        done();
      });
    });

  });

  describe('#acceptOffer', function() {

    it('should callback false if not awaiting offer', function(done) {
      RenterInterface.prototype.acceptOffer.call({
        offerManager: { getStream: sinon.stub().returns(null) },
        isAwaitingOffer: sinon.stub().callsArgWith(1, null, false)
      }, {}, {
        get: sinon.stub().returns('test')
      }, function(err, didAcceptOffer) {
        expect(didAcceptOffer).to.equal(false);
        done();
      });
    });

    it('should callback true if awaiting offer', function(done) {
      RenterInterface.prototype.acceptOffer.call({
        offerManager: { getStream: sinon.stub().returns({
          addOfferToQueue: sinon.stub()
        }) },
        isAwaitingOffer: sinon.stub().callsArgWith(1, null, true)
      }, {}, {
        get: sinon.stub().returns('test')
      }, function(err, didAcceptOffer) {
        expect(didAcceptOffer).to.equal(true);
        done();
      });
    });

  });

  describe('#getStorageOffer', function() {

    it('should timeout the contract publication and callback', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        tunnelServerPort: 0,
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var clock = sinon.useFakeTimers();
      var contract = Contract({});
      var publish = sinon.stub(renter, 'publish');
      renter.getStorageOffer(contract, [], function(err) {
        clock.restore();
        publish.restore();
        expect(err.message).to.equal(
          'No storage offers were received'
        );
        done();
      });
      clock.tick(15000);
    });

    it('should default the blacklist to empty', function() {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var contract = Contract({ data_hash: utils.rmd160('') });
      var publish = sinon.stub(renter, 'publish');
      var callback = sinon.stub();
      renter.getStorageOffer(contract, callback);
      expect(
        renter.offerManager.getStream(utils.rmd160('')).options.farmerBlacklist
      ).to.have.lengthOf(0);
      publish.restore();
    });

    it('should do nothing if the callback was already called', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var clock = sinon.useFakeTimers();
      var contract = Contract({ data_hash: utils.rmd160('') });
      var publish = sinon.stub(renter, 'publish');
      var callback = sinon.stub();
      renter.getStorageOffer(contract, [], callback);
      renter.offerManager.removeStream(utils.rmd160(''));
      clock.tick(15000);
      clock.restore();
      setImmediate(function() {
        publish.restore();
        expect(callback.called).to.equal(false);
        done();
      });
    });

  });

  describe('#getStorageProof', function() {

    it('should return error if no contracts for farmer', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: KeyPair().getNodeID()
      });
      var item = new StorageItem();
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal(
          'Item has no contracts with supplied farmer'
        );
        done();
      });
    });

    it('should return error if no challenges left for farmer', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var nodeID = KeyPair().getNodeID();
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: nodeID
      });
      var data = {
        contracts: {},
        challenges: {}
      };
      data.contracts[nodeID] = new Contract({
        renter_id: renter.keyPair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: [] };
      var item = new StorageItem(data);
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal(
          'There are no remaining challenges to send'
        );
        done();
      });
    });

    it('should return error if transport fails', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var nodeID = KeyPair().getNodeID();
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: nodeID
      });
      var data = {
        contracts: {},
        challenges: {}
      };
      data.contracts[nodeID] = new Contract({
        renter_id: renter.keyPair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2, new Error('Transport error')
      );
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal('Transport error');
        _send.restore();
        done();
      });
    });

    it('should return error if farmer responds with one', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var nodeID = KeyPair().getNodeID();
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: nodeID
      });
      var data = {
        contracts: {},
        challenges: {}
      };
      data.contracts[nodeID] = new Contract({
        renter_id: renter.keyPair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2, null, { error: { message: 'I refuse to be audited!' } }
      );
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal('I refuse to be audited!');
        _send.restore();
        done();
      });
    });

    it('should error if farmer responds with invalid proof', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var nodeID = KeyPair().getNodeID();
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: nodeID
      });
      var data = {
        contracts: {},
        challenges: {}
      };
      data.contracts[nodeID] = new Contract({
        renter_id: renter.keyPair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2, null, { result: { proof: 'I promise i have it' } }
      );
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal('Invalid proof returned');
        _send.restore();
        done();
      });
    });

    it('should succeed if farmer responds with valid proof', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var nodeID = KeyPair().getNodeID();
      var farmer = new Contact({
        address: '127.0.0.1',
        port: 6666,
        nodeID: nodeID
      });
      var data = {
        contracts: {},
        challenges: {}
      };
      data.contracts[nodeID] = new Contract({
        renter_id: renter.keyPair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2, null, { result: { proofs: ['VALID?'] } }
      );
      renter.getStorageProof(farmer, item, function(err, proof) {
        expect(proof).to.equal('VALID?');
        _send.restore();
        done();
      });
    });

  });

  describe('#getConsignmentPointer', function() {

    it('should callback error if transport send fails', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      var audit = new AuditStream(1);
      audit.end(Buffer('data'));
      setImmediate(function() {
        renter.getConsignmentPointer(Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }), Contract({}), audit, function(err) {
          _send.restore();
          expect(err.message).to.equal('Send failed');
          done();
        });
      });
    });

    it('should callback error if contact responds with one', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { error: { message: 'FAILED' } }
      );
      var audit = new AuditStream(1);
      audit.end(Buffer('data'));
      setImmediate(function() {
        renter.getConsignmentPointer(Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }), Contract({}), audit, function(err) {
          _send.restore();
          expect(err.message).to.equal('FAILED');
          done();
        });
      });
    });

    it('should callback with pointer', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { result: { token: utils.rmd160('') } }
      );
      var audit = new AuditStream(1);
      audit.end(Buffer('data'));
      setImmediate(function() {
        renter.getConsignmentPointer(Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }), Contract({
          data_hash: utils.rmd160('')
        }), audit, function(err, pointer) {
          _send.restore();
          expect(pointer.token).to.equal(utils.rmd160(''));
          done();
        });
      });
    });

  });

  describe('#getRetrievalPointer', function() {

    it('should callback error if transport send fails', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      renter.getRetrievalPointer(Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      }), Contract({}), function(err) {
        _send.restore();
        expect(err.message).to.equal('Send failed');
        done();
      });
    });

    it('should callback error if contract responds with one', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { error: { message: 'FAILED' } }
      );
      renter.getRetrievalPointer(Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      }), Contract({}), function(err) {
        _send.restore();
        expect(err.message).to.equal('FAILED');
        done();
      });
    });

    it('should callback with pointer', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { result: { token: utils.rmd160('') } }
      );
      setImmediate(function() {
        renter.getRetrievalPointer(Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }), Contract({
          data_hash: utils.rmd160('')
        }), function(err, pointer) {
          _send.restore();
          expect(pointer.token).to.equal(utils.rmd160(''));
          done();
        });
      });
    });
  });

  describe('#getMirrorNodes', function() {

    it('should callback error if all nodes fail', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      renter.getMirrorNodes([DataChannelPointer(
        Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }),
        utils.rmd160('hash'),
        utils.generateToken()
      )], [Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      })], function(err) {
        _send.restore();
        expect(err.message).to.equal('All mirror requests failed');
        done();
      });
    });

    it('should callback error if all nodes fail', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var _send = sinon.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { result: {} }
      );
      renter.getMirrorNodes([DataChannelPointer(
        Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }),
        utils.rmd160('hash'),
        utils.generateToken()
      )], [Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      })], function(err, results) {
        _send.restore();
        expect(results).to.lengthOf(1);
        done();
      });
    });

  });

  after(function() {
    CLEANUP.forEach(function(renter) {
      if (renter.node) {
        renter.leave();
      }
    });
  });

});
