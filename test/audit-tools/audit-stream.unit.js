'use strict';

var crypto = require('crypto');
var expect = require('chai').expect;
var AuditStream = require('../../lib/audit-tools/audit-stream');

var SHARD = new Buffer('testshard');

describe('AuditStream', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(AuditStream(24)).to.be.instanceOf(AuditStream);
    });

    it('should create challenges for the specified audits', function() {
      var audit = new AuditStream(24);
      expect(audit._challenges).to.have.lengthOf(24);
    });

  });

  describe('#_generateChallenge', function() {

    it('should return a random 256 bit challenge', function() {
      var challenge = AuditStream(6)._generateChallenge();
      expect(challenge).to.have.lengthOf(64);
      expect(Buffer(challenge, 'hex')).to.have.lengthOf(32);
    });

  });

  describe('#_createResponseInput', function() {

    it('should return double hash of data plus hex encoded shard', function() {
      var audit = new AuditStream(6);
      var data = new Buffer('test').toString('hex');
      var response = audit._createResponseInput(data);
      expect(response).to.be.instanceOf(crypto.Hash);
    });

  });

  describe('#getPublicRecord', function() {

    it('should return the bottom leaves of the merkle tree', function(done) {
      var audit = new AuditStream(12);
      audit.on('finish', function() {
        var leaves = audit.getPublicRecord();
        var branch = audit._tree.level(4);
        leaves.forEach(function(leaf) {
          expect(branch.indexOf(leaf)).to.not.equal(-1);
        });
        done();
      });
      audit.write(SHARD);
      audit.end();
    });

  });

  describe('#getPrivateRecord', function() {

    it('should return the root, depth, and challenges', function(done) {
      var audit = new AuditStream(12);
      audit.on('finish', function() {
        var secret = audit.getPrivateRecord();
        expect(secret.root).to.equal(audit._tree.root().toLowerCase());
        expect(secret.depth).to.equal(audit._tree.levels());
        expect(secret.challenges).to.equal(audit._challenges);
        done();
      });
      audit.write(SHARD);
      audit.end();
    });

  });

});

describe('AuditStream#fromRecords', function() {

  it('should return the same result when created from record', function(done) {
    var audit1 = new AuditStream(12);
    audit1.on('finish', function() {
      var tree1 = audit1.getPublicRecord();
      var challenges1 = audit1.getPrivateRecord().challenges;
      var audit2 = AuditStream.fromRecords(challenges1, tree1);
      var tree2 = audit2.getPublicRecord();
      var challenges2 = audit2.getPrivateRecord().challenges;
      challenges2.forEach(function(c, i) {
        expect(c).to.equal(challenges1[i]);
      });
      tree2.forEach(function(l, i) {
        expect(l).to.equal(tree1[i]);
      });
      expect(
        audit1.getPrivateRecord().depth
      ).to.equal(
        audit2.getPrivateRecord().depth
      );
      expect(
        audit1.getPrivateRecord().root
      ).to.equal(
        audit2.getPrivateRecord().root
      );
      done();
    });
    audit1.write(SHARD);
    audit1.end();
  });

});
