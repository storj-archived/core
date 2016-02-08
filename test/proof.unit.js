'use strict';

var expect = require('chai').expect;
var Audit = require('../lib/audit');
var Proof = require('../lib/proof');
var utils = require('../lib/utils');

describe('Proof', function() {

  var SHARD = new Buffer('testshard');

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Proof({ leaves: [], shard: SHARD })).to.be.instanceOf(Proof);
    });

  });

  describe('#_generateLeaves', function() {

    it('should append empty bottom leaves to the power of two', function() {
      var audit = new Audit({ shard: SHARD, audits: 12 });
      var proof = new Proof({ leaves: audit.getPublicRecord(), shard: SHARD });
      var leaves = proof._generateLeaves(audit.getPublicRecord());
      expect(leaves.length).to.equal(16);
      leaves.splice(12).forEach(function(leaf) {
        expect(leaf).to.equal(utils.sha256(''));
      });
    });

  });

  describe('#prove', function() {

    it('should create a recursive tuple structure with leaves', function() {
      var audit = new Audit({ shard: SHARD, audits: 12 });
      var challenge = audit.getPrivateRecord().challenges[0];
      var proof = new Proof({ leaves: audit.getPublicRecord(), shard: SHARD });
      var result = proof.prove(challenge);

      expect(
        JSON.stringify(audit._tree.level(4))
      ).to.equal(
        JSON.stringify(proof._tree.level(4))
      );

      expect(
        JSON.stringify(audit._tree.level(3))
      ).to.equal(
        JSON.stringify(proof._tree.level(3))
      );

      expect(
        JSON.stringify(audit._tree.level(2))
      ).to.equal(
        JSON.stringify(proof._tree.level(2))
      );

      expect(
        JSON.stringify(audit._tree.level(1))
      ).to.equal(
        JSON.stringify(proof._tree.level(1))
      );

      expect(
        JSON.stringify(audit._tree.level(0))
      ).to.equal(
        JSON.stringify(proof._tree.level(0))
      );

      function checkLeaf(branch, depth) {
        if (Array.isArray(branch[0])) {
          expect(proof._tree.level(depth).indexOf(branch[1])).to.not.equal(-1);
          if (branch.length !== 1) {
            checkLeaf(branch[0], depth - 1);
          }
        } else {
          expect(proof._tree.level(depth).indexOf(branch[0])).to.not.equal(-1);
          if (branch.length !== 1) {
            checkLeaf(branch[1], depth - 1);
          }
        }
      }

      checkLeaf(result, audit.getPrivateRecord().depth - 1);
    });

  });

});
