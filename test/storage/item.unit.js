'use strict';

var expect = require('chai').expect;
var HDKey = require('hdkey');
var StorageItem = require('../../lib/storage/item');
var AuditStream = require('../../lib/audit-tools/audit-stream');
var Contact = require('../../lib/network/contact');
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/crypto-tools/keypair');
var utils = require('../../lib/utils');

describe('StorageItem', function() {
  var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
      'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
      'ce8af';

  var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
  var hdKey = masterKey.derive('m/3000\'/0\'');
  var nodeHdKey = hdKey.deriveChild(12);
  var keyPair = KeyPair(nodeHdKey.privateKey.toString('hex'));

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(StorageItem()).to.be.instanceOf(StorageItem);
    });

  });

  describe('#addContract', function() {
    it('should add the contract at the nodeID', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: KeyPair().getNodeID()
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.contracts[contact.nodeID]).to.equal(contract);
    });

    it('should add the hdkey map if contract has renter_hd_key', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID(),
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_hd_key: hdKey.publicExtendedKey,
        renter_hd_index: 12,
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.contractsHDMap[hdKey.publicExtendedKey]).to.equal(contract);
    });

  });

  describe('#removeContract', function() {

    it('should delete the hd contract for the hd contact', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID(),
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_hd_key: hdKey.publicExtendedKey,
        renter_hd_index: 12,
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      item.removeContract(contact);
      expect(item.getContract(contact)).to.equal(false);
    });

    it('should delete non-hd contract for the non-hd contact', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID()
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      item.removeContract(contact);
      expect(item.getContract(contact)).to.equal(false);
    });

    it('should not delete a contract not found', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID()
      });
      var item = new StorageItem();
      expect(item.removeContract(contact)).to.equal(false);
    });

  });

  describe('#getContract', function() {

    it('should get the hd contract for the hd contact', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID(),
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_hd_key: hdKey.publicExtendedKey,
        renter_hd_index: 12,
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.getContract(contact)).to.equal(contract);
    });

    it('should return non-hd contract for the non-hd contact', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID()
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_id: contact.nodeID,
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.getContract(contact)).to.equal(contract);
    });

    it('should not return a contract non-hd', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID()
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_id: keyPair.getNodeID(),
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.getContract({nodeID: KeyPair().getNodeID()})).to.equal(false);
    });

    it('should not return an hd contract', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID(),
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });
      var hdKey2 = masterKey.derive('m/3000\'/1\'');
      var nodeHdKey2 = hdKey2.deriveChild(12);
      var keyPair2 = KeyPair(nodeHdKey2.privateKey.toString('hex'));
      var otherContact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair2.getNodeID(),
        hdKey: hdKey2.publicExtendedKey,
        hdIndex: 12
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_hd_key: hdKey.publicExtendedKey,
        renter_hd_index: 12,
        renter_id: keyPair.getNodeID(),
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.getContract(otherContact)).to.equal(false);
    });

    it('should return an hd contract with sibling contact', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair.getNodeID(),
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });
      var hdKey3 = masterKey.derive('m/3000\'/0\'');
      var nodeHdKey3 = hdKey3.deriveChild(100000);
      var keyPair3 = KeyPair(nodeHdKey3.privateKey.toString('hex'));
      var siblingContact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: keyPair3.getNodeID(),
        hdKey: hdKey3.publicExtendedKey,
        hdIndex: 100000
      });
      var item = new StorageItem();
      var contract = new Contract({
        renter_hd_key: hdKey.publicExtendedKey,
        renter_hd_index: 12,
        renter_id: keyPair.getNodeID(),
        data_size: 1234,
        data_hash: utils.rmd160sha256(''),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      item.addContract(contact, contract);
      expect(item.getContract(siblingContact)).to.equal(contract);
    });

  });

  describe('#addAuditRecords', function() {

    it('should add the audit data at the nodeID', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: KeyPair().getNodeID()
      });
      var item = new StorageItem();
      var audit = new AuditStream(6);
      audit.end(Buffer('test'));
      setImmediate(function() {
        item.addAuditRecords(contact, audit);
        expect(
          JSON.stringify(item.trees[contact.nodeID])
        ).to.equal(
          JSON.stringify(audit.getPublicRecord())
        );
        expect(
          JSON.stringify(item.challenges[contact.nodeID])
        ).to.equal(
          JSON.stringify(audit.getPrivateRecord())
        );
      });
    });

    it('should add the audit stream data at the nodeID', function(done) {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: KeyPair().getNodeID()
      });
      var item = new StorageItem();
      var auditstream = new AuditStream(6);
      auditstream.on('finish', function() {
        item.addAuditRecords(contact, auditstream);
        expect(
          JSON.stringify(item.trees[contact.nodeID])
        ).to.equal(
          JSON.stringify(auditstream.getPublicRecord())
        );
        expect(
          JSON.stringify(item.challenges[contact.nodeID])
        ).to.equal(
          JSON.stringify(auditstream.getPrivateRecord())
        );
        done();
      });
      auditstream.write(Buffer('test'));
      auditstream.end();
    });

  });

  describe('#addMetaData', function() {

    it('should add the metadata at the nodeID', function() {
      var contact = new Contact({
        address: '127.0.0.1',
        port: 1336,
        nodeID: KeyPair().getNodeID()
      });
      var item = new StorageItem();
      var meta = {
        downloaded: 1234
      };
      item.addMetaData(contact, meta);
      expect(item.meta[contact.nodeID]).to.equal(meta);
    });

  });

});
