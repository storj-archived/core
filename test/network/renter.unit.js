'use strict';

var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/crypto-tools/keypair');
var RenterInterface = require('../../lib/network/renter');
var kad = require('kad');
var sinon = require('sinon');
var utils = require('../../lib/utils');
var Contact = require('../../lib/network/contact');
var StorageItem = require('../../lib/storage/item');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var StorageManager = require('../../lib/storage/manager');
var AuditStream = require('../../lib/audit-tools/audit-stream');
var OfferStream = require('../../lib/contract/offer-stream');

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

  describe('#getOfferStream', function() {

    it('should create stream and add to manager, then publish', function() {
      var kp = KeyPair();
      var renter = new RenterInterface({
        keyPair: kp,
        rpcPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        tunnelServerPort: 0,
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      var contract = Contract({
        data_hash: utils.rmd160(''),
        renter_id: kp.getNodeID()
      });
      var publish = sinon.stub(renter, 'publish');
      var offerStream = renter.getOfferStream(contract);
      expect(offerStream).to.be.instanceOf(OfferStream);
      expect(
        Object.keys(renter.offerManager._offerStreams)
      ).to.have.lengthOf(1);
      expect(publish.called).to.equal(true);
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
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('should callback error if all nodes fail (send error)', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      sandbox.stub(renter.transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      renter.getMirrorNodes([{
        farmer: Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }),
        hash: utils.rmd160('hash'),
        token: utils.generateToken(),
        operation: 'PULL'
      }], [Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      })], function(err) {
        expect(err).instanceOf(Error);
        expect(err.message).to.equal('All mirror requests failed');
        done();
      });
    });

    it('should callback error if length of result is zero', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      sandbox.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        null
      );
      renter.getMirrorNodes([{
        farmer: Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }),
        hash: utils.rmd160('hash'),
        token: utils.generateToken(),
        operation: 'PULL'
      }], [Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      })], function(err) {
        expect(err).instanceOf(Error);
        expect(err.message).to.equal('All mirror requests failed');
        done();
      });
    });

    it('should NOT callback error if all nodes give result', function(done) {
      var renter = new RenterInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: StorageManager(RAMStorageAdapter())
      });
      CLEANUP.push(renter);
      sandbox.stub(renter.transport, 'send').callsArgWith(
        2,
        null,
        { result: {} }
      );
      renter.getMirrorNodes([{
        farmer: Contact({
          address: '0.0.0.0',
          port: 0,
          nodeID: utils.rmd160('contact')
        }),
        hash: utils.rmd160('hash'),
        token: utils.generateToken(),
        operation: 'PULL'
      }], [Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      })], function(err, results) {
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
