'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var utils = require('../lib/utils');
var Audit = require('../lib/audit');

describe('Audit', function() {

  var SHARD = new Buffer('testshard');

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Audit()).to.be.instanceOf(Audit);
    });

    it('should automatically call _generateTree', function() {
      var _generateTree = sinon.stub(Audit.prototype, '_generateTree');
      Audit();
      expect(_generateTree.called).to.equal(true);
      _generateTree.restore();
    });

    it('should create challenges for the specified audits', function() {
      var audit = new Audit({ audits: 24 });
      expect(audit._challenges).to.have.lengthOf(24);
    });

  });

  describe('#_generateChallenge', function() {

    it('should return a random 256 bit challenge', function() {
      var challenge = Audit()._generateChallenge();
      expect(challenge).to.have.lengthOf(64);
      expect(Buffer(challenge, 'hex')).to.have.lengthOf(32);
    });

  });

  describe('#_createResponseInput', function() {

    it('should return double hash of data plus hex encoded shard', function() {
      var audit = new Audit({ shard: SHARD });
      var data = new Buffer('test').toString('hex');
      var response = audit._createResponseInput(data);
      var expected = utils.rmd160sha256(utils.rmd160sha256(
        data + SHARD.toString('hex')
      ));
      expect(response).to.equal(expected);
    });

  });

  describe('#getPublicRecord', function() {

    it('should return the bottom leaves of the merkle tree', function() {
      var audit = new Audit({ shard: SHARD, audits: 12 });
      var leaves = audit.getPublicRecord();
      var branch = audit._tree.level(4);
      leaves.forEach(function(leaf) {
        expect(branch.indexOf(leaf)).to.not.equal(-1);
      });
    });

  });

  describe('#getPrivateRecord', function() {

    it('should return the root, depth, and challenges', function() {
      var audit = new Audit({ shard: SHARD, audits: 12 });
      var secret = audit.getPrivateRecord();
      expect(secret.root).to.equal(audit._tree.root().toLowerCase());
      expect(secret.depth).to.equal(audit._tree.levels());
      expect(secret.challenges).to.equal(audit._challenges);
    });

  });

});
