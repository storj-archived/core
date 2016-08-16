'use strict';

var expect = require('chai').expect;
var AuditStream = require('../../lib/audit-tools/audit-stream');
var ProofStream = require('../../lib/audit-tools/proof-stream');
var Verification = require('../../lib/audit-tools/verification');
var utils = require('../../lib/utils');

describe('Verification', function() {

  var SHARD = new Buffer('testshard');

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Verification([])).to.be.instanceOf(Verification);
    });

    it('should throw without a proof response', function() {
      expect(function() {
        Verification(null);}
      ).to.throw(Error, 'Proof must be an array');
    });

  });

  describe('#_getChallengeResponse', function() {

    it('should return the hash of the innermost leaf', function() {
      var verification = new Verification([]);
      var challengeResp = verification._getChallengeResponse(
        ['beep', ['boop', [['bar'], 'foo']]]
      );
      expect(challengeResp).to.equal(utils.rmd160sha256('bar'));
    });

  });

  describe('#verify', function() {

    it('should verify the proof response', function() {
      var audit = new AuditStream(12);
      audit.end(SHARD);
      setImmediate(function() {
        var secret = audit.getPrivateRecord();
        var request = audit.getPublicRecord();
        var proof = new ProofStream(request, secret.challenges[1]);
        proof.end(SHARD);
        setImmediate(function() {
          var response = proof.getProofResult();
          var verification = new Verification(response);
          var result = verification.verify(secret.root, secret.depth);
          expect(result[0]).to.equal(result[1]);
        });
      });
    });

  });

});
