'use strict';

const { expect } = require('chai');
const AuditStream = require('../lib/audit');
const ProofStream = require('../lib/proof');
const utils = require('../lib/utils');
const sinon = require('sinon');


describe('Proof', function() {

  const CHALLENGE = Buffer.from(
    'd3ccb55d5c9bd56606bca0187ecf28699cb674fb7e243fb4f180078735181686',
    'hex'
  );
  const SHARD = Buffer.from('testshard');

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(new ProofStream([], CHALLENGE)).to.be.instanceOf(ProofStream);
    });

  });

  describe('#_generateLeaves', function() {

    it('should append empty bottom leaves to the power of two', function(done) {
      const audit = new AuditStream(12);
      audit.end(SHARD);
      setImmediate(function() {
        const proof = new ProofStream(audit.getPublicRecord(), CHALLENGE);
        const leaves = proof._generateLeaves(Array(12));
        expect(leaves.length).to.equal(16);
        leaves.splice(12).forEach(function(leaf) {
          expect(Buffer.compare(leaf, utils.rmd160sha256(''))).to.equal(0);
        });
        done();
      });
    });

  });

  describe('#_flush', function() {

    it('should emit an error if generate proof fails', function(done) {
      var proof = new ProofStream([], CHALLENGE);
      var _generateProof = sinon.stub(proof, '_generateProof').throws(
        new Error('Failed')
      );
      proof._flush(function(err) {
        _generateProof.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#getProofResult', function() {

    it('should create a recursive tuple structure with leaves', function(done) {
      var audit = new AuditStream(12);
      audit.end(SHARD);
      setImmediate(function() {
        var challenge = audit.getPrivateRecord().challenges[1];
        var proof = new ProofStream(audit.getPublicRecord(), challenge);

        proof.end(SHARD);
        setImmediate(function() {
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

          function _getChallengeResponse(data) {
            if (data.length === 1) {
              return utils.rmd160sha256(data[0]);
            }

            if (Array.isArray(data[0])) {
              return _getChallengeResponse(data[0]);
            } else {
              return _getChallengeResponse(data[1]);
            }
          }

          var result = proof.getProofResult();

          expect(result).to.have.lengthOf(2);
          expect(_getChallengeResponse(result).toString('hex')).to.equal(
            utils.rmd160sha256(utils.rmd160sha256(
              Buffer.concat([Buffer.from(challenge, 'hex'), SHARD])
            )).toString('hex')
          );
          done();
        });
      });
    });

  });

});
