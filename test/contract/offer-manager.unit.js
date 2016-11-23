'use strict';

var utils = require('../../lib/utils');
var expect = require('chai').expect;
var OfferManager = require('../../lib/contract/offer-manager');
var OfferStream = require('../../lib/contract/offer-stream');
var KeyPair = require('../../lib/crypto-tools/keypair');
var Contract = require('../../lib/contract');

describe('OfferManager', function() {

  var keyPair = new KeyPair();
  var sampleContract = new Contract({
    data_hash: utils.rmd160(''),
    renter_id: keyPair.getNodeID()
  });
  sampleContract.sign('renter', keyPair.getPrivateKey());

  describe('@constructor', function() {

    it('should create a instance without the new keyword', function() {
      expect(OfferManager()).to.be.instanceOf(OfferManager);
    });

  });

  describe('#getStream', function() {

    it('should return the stream if it exists', function() {
      var offerManager = new OfferManager();
      var offerStream = new OfferStream(sampleContract);
      offerManager.addStream(offerStream);
      expect(offerManager.getStream(utils.rmd160(''))).to.equal(offerStream);
    });

    it('should return null of no stream', function() {
      var offerManager = new OfferManager();
      expect(offerManager.getStream(utils.rmd160(''))).to.equal(null);
    });

  });

  describe('#removeStream', function() {

    it('should remove the stream', function() {
      var offerManager = new OfferManager();
      var offerStream = new OfferStream(sampleContract);
      offerManager.addStream(offerStream);
      offerManager.removeStream(utils.rmd160(''));
      expect(offerManager.getStream(utils.rmd160(''))).to.equal(null);
    });

  });

});
