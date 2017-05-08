'use strict';

const { expect } = require('chai');
const OfferStream = require('../lib/offers');
const Contract = require('../lib/contract');


describe('@class Offers', function() {

  describe('@private _read', function() {

    it('should emit all offers in queue', function(done) {
      const offers = new OfferStream({}, { maxOffers: 4 });
      const contracts = [
        new Contract(), new Contract(), new Contract()
      ].map((c, i) => {
        c.isComplete = () => true;
        return [['farmer' + i, {}], c];
      });
      contracts.forEach(([a, b]) => offers.queue(a, b, () => null));
      let emitted = 0;
      offers.on('data', () => emitted++);
      setTimeout(() => {
        let c = new Contract();
        c.isComplete = () => true;
        offers.queue(['farmer3', {}], c, () => null);
      }, 50);
      offers.on('end', () => {
        expect(emitted).to.equal(4);
        done();
      })
    });

  });

  describe('@method queue', function() {

    it('should callback error if stream destroyed', function(done) {
      const offers = new OfferStream();
      offers._isDestroyed = true;
      offers.queue(['identity', {}], Contract.from({}), (err) => {
        expect(err.message).to.equal('Storage offer rejected');
        done();
      });
    });

    it('should callback error if offer already sent', function(done) {
      const offers = new OfferStream();
      offers._farmersDidOffer = ['identity'];
      offers.queue(['identity', {}], Contract.from({}), (err) => {
        expect(err.message).to.equal('Storage offer rejected');
        done();
      });
    });

    it('should callback error if contract incomplete', function(done) {
      const offers = new OfferStream();
      offers.queue(['identity', {}], Contract.from({}), (err) => {
        expect(err.message).to.equal('Storage offer rejected');
        done();
      });
    });

    it('should callback error if offer queue is full', function(done) {
      const offers = new OfferStream({}, { maxOffers: 0 });
      const contract = Contract.from({});
      contract.isComplete = () => true;
      offers.queue(['identity', {}], contract, (err) => {
        expect(err.message).to.equal('Storage offer rejected');
        done();
      });
    });

  });

  describe('@method destroy', function() {

    it('should empty queue, kill listeners, and emit destroy', function(done) {
      const offers = new OfferStream();
      offers.once('destroy', done);
      setImmediate(() => offers.destroy());
    });

  });

});
