'use strict';

var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/keypair');
var RenterInterface = require('../../lib/interfaces/renter');
var kad = require('kad');
var sinon = require('sinon');
var utils = require('../../lib/utils');
var Contact = require('../../lib/network/contact');
var StorageItem = require('../../lib/storage/item');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var Manager = require('../../lib/manager');
var AuditStream = require('../../lib/auditstream');
var DataChannelPointer = require('../../lib/datachannel/pointer');

describe('RenterInterface', function() {

  describe('#getStorageProof', function() {

    it('should return error if no contracts for farmer', function(done) {
      var renter = new RenterInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
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
        renter_id: renter._keypair.getNodeID(),
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
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
        renter_id: renter._keypair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
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
        renter_id: renter._keypair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
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
        renter_id: renter._keypair.getNodeID(),
        data_size: 10,
        data_hash: 'a8a412aaf3cc8da088ef00d9d6185fe94fc9f9bc',
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      data.challenges[nodeID] = { challenges: ['challenge'] };
      var item = new StorageItem(data);
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
        2, null, { result: { proof: 'I promise i have it' } }
      );
      renter.getStorageProof(farmer, item, function(err) {
        expect(err.message).to.equal('Invalid proof returned');
        _send.restore();
        done();
      });
    });

  });

  describe('#getConsignToken', function() {

    it('should callback error if transport send fails', function(done) {
      var renter = new RenterInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      var audit = new AuditStream(1);
      audit.end(Buffer('data'));
      setImmediate(function() {
        renter.getConsignToken(Contact({
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

    it('should callback error if contract responds with one', function(done) {
      var renter = new RenterInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
        2,
        null,
        { error: { message: 'FAILED' } }
      );
      var audit = new AuditStream(1);
      audit.end(Buffer('data'));
      setImmediate(function() {
        renter.getConsignToken(Contact({
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

  });

  describe('#getRetrieveToken', function() {

    it('should callback error if transport send fails', function(done) {
      var renter = new RenterInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
        2,
        new Error('Send failed')
      );
      renter.getRetrieveToken(Contact({
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
        2,
        null,
        { error: { message: 'FAILED' } }
      );
      renter.getRetrieveToken(Contact({
        address: '0.0.0.0',
        port: 0,
        nodeID: utils.rmd160('contact')
      }), Contract({}), function(err) {
        _send.restore();
        expect(err.message).to.equal('FAILED');
        done();
      });
    });

  });

  describe('#getMirrorNodes', function() {

    it('should callback error if all nodes fail', function(done) {
      var renter = new RenterInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        manager: Manager(RAMStorageAdapter())
      });
      var _send = sinon.stub(renter._transport, 'send').callsArgWith(
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

  });

});
