'use strict';

var expect = require('chai').expect;
var StorageItem = require('../../lib/storage/item');
var AuditStream = require('../../lib/auditstream');
var Contact = require('../../lib/network/contact');
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/keypair');
var utils = require('../../lib/utils');

describe('StorageItem', function() {

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
