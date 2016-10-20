'use strict';

var Contract = require('../../lib/contract');
var Contact = require('../../lib/network/contact');
var OfferStream = require('../../lib/contract/offer-stream');
var expect = require('chai').expect;
var utils = require('../../lib/utils');
var KeyPair = require('../../lib/crypto-tools/keypair');

describe('OfferStream', function() {

  var keyPair = new KeyPair();
  var sampleContract = new Contract({
    data_hash: utils.rmd160(''),
    renter_id: keyPair.getNodeID()
  });
  sampleContract.sign('renter', keyPair.getPrivateKey());

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(OfferStream(sampleContract)).to.be.instanceOf(OfferStream);
    });

  });

  describe('#addOfferToQueue', function() {

    it('should add the offer to the queue', function() {
      var farmer = new KeyPair();
      var contact = new Contact({
        address: 'localhost',
        port: 80,
        nodeID: farmer.getNodeID()
      });
      var contract = Contract.fromObject(sampleContract.toObject());
      contract.set('farmer_id', farmer.getNodeID());
      contract.set('payment_destination', farmer.getAddress());
      contract.sign('farmer', farmer.getPrivateKey());
      var offerStream = new OfferStream(contract);
      expect(offerStream.addOfferToQueue(contact, contract)).to.equal(true);
      expect(offerStream._queue).to.have.lengthOf(1);
    });

    it('should not add the offer to the queue (incomplete)', function() {
      var farmer = new KeyPair();
      var contact = new Contact({
        address: 'localhost',
        port: 80,
        nodeID: farmer.getNodeID()
      });
      var contract = Contract.fromObject(sampleContract.toObject());
      contract.set('farmer_id', farmer.getNodeID());
      contract.sign('farmer', farmer.getPrivateKey());
      var offerStream = new OfferStream(contract);
      expect(offerStream.addOfferToQueue(contact, contract)).to.equal(false);
      expect(offerStream._queue).to.have.lengthOf(0);
    });

    it('should not add the offer to the queue (duplicate)', function() {
      var farmer = new KeyPair();
      var contact = new Contact({
        address: 'localhost',
        port: 80,
        nodeID: farmer.getNodeID()
      });
      var contract = Contract.fromObject(sampleContract.toObject());
      contract.set('farmer_id', farmer.getNodeID());
      contract.set('payment_destination', farmer.getAddress());
      contract.sign('farmer', farmer.getPrivateKey());
      var offerStream = new OfferStream(contract);
      offerStream._farmersDidOffer.push(farmer.getNodeID());
      expect(offerStream.addOfferToQueue(contact, contract)).to.equal(false);
      expect(offerStream._queue).to.have.lengthOf(0);
    });

    it('should not add the offer to the queue (max offers)', function() {
      var farmer = new KeyPair();
      var contact = new Contact({
        address: 'localhost',
        port: 80,
        nodeID: farmer.getNodeID()
      });
      var contract = Contract.fromObject(sampleContract.toObject());
      contract.set('farmer_id', farmer.getNodeID());
      contract.set('payment_destination', farmer.getAddress());
      contract.sign('farmer', farmer.getPrivateKey());
      var offerStream = new OfferStream(contract, { maxOffers: 0 });
      expect(offerStream.addOfferToQueue(contact, contract)).to.equal(false);
      expect(offerStream._queue).to.have.lengthOf(0);
    });

  });

  describe('#event:data', function() {

    it('should emit the offers when the listener is added', function(done) {
      function getTestOffer() {
        var farmer = new KeyPair();
        var contact = new Contact({
          address: 'localhost',
          port: 80,
          nodeID: farmer.getNodeID()
        });
        var contract = Contract.fromObject(sampleContract.toObject());
        contract.set('farmer_id', farmer.getNodeID());
        contract.set('payment_destination', farmer.getAddress());
        contract.sign('farmer', farmer.getPrivateKey());
        return [contact, contract];
      }
      var events = 0;
      var offerStream = new OfferStream(sampleContract);
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.on('data', function(offer) {
        expect(offer.contract).to.be.instanceOf(Contract);
        expect(offer.contact).to.be.instanceOf(Contact);
        events++;
        if (events === 4) {
          done();
        }
      });
    });

    it('should properly pause/resume stream', function(done) {
      function getTestOffer() {
        var farmer = new KeyPair();
        var contact = new Contact({
          address: 'localhost',
          port: 80,
          nodeID: farmer.getNodeID()
        });
        var contract = Contract.fromObject(sampleContract.toObject());
        contract.set('farmer_id', farmer.getNodeID());
        contract.set('payment_destination', farmer.getAddress());
        contract.sign('farmer', farmer.getPrivateKey());
        return [contact, contract];
      }
      var events = 0;
      var offerStream = new OfferStream(sampleContract);
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.on('data', function() {
        offerStream.pause();
        setTimeout(function() {
          events++;
          offerStream.resume();
          if (events === 4) {
            done();
          }
        }, 10);
      });
    });

  });

  describe('#event:end', function() {

    it('should properly end the stream', function(done) {
      function getTestOffer() {
        var farmer = new KeyPair();
        var contact = new Contact({
          address: 'localhost',
          port: 80,
          nodeID: farmer.getNodeID()
        });
        var contract = Contract.fromObject(sampleContract.toObject());
        contract.set('farmer_id', farmer.getNodeID());
        contract.set('payment_destination', farmer.getAddress());
        contract.sign('farmer', farmer.getPrivateKey());
        return [contact, contract];
      }
      var offerStream = new OfferStream(sampleContract, { maxOffers: 4 });
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.addOfferToQueue.apply(offerStream, getTestOffer());
      offerStream.on('data', function() {}).on('end', done);
    });

  });

  describe('#destroy', function() {

    it('should empty queue, remove listeners, and set flag', function(done) {
      var farmer = new KeyPair();
      var contract = Contract.fromObject(sampleContract.toObject());
      contract.set('farmer_id', farmer.getNodeID());
      contract.set('payment_destination', farmer.getAddress());
      contract.sign('farmer', farmer.getPrivateKey());
      var offerStream = new OfferStream(contract, { maxOffers: 0 });
      offerStream.on('destroy', function() {
        expect(offerStream._queue).to.have.lengthOf(0);
        expect(offerStream._isDestroyed).to.equal(true);
        setImmediate(function() {
          expect(offerStream.listenerCount('destroy')).to.equal(0);
          done();
        });
      });
      setImmediate(function() {
        offerStream.destroy();
      });
    });

  });

});
