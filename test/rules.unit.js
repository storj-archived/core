'use strict';

const { expect } = require('chai');
const crypto = require('crypto');
const { utils: keyutils } = require('kad-spartacus');
const OfferStream = require('../lib/offers');
const Contract = require('../lib/contract');
const Rules = require('../lib/rules');


describe('@class Rules', function() {

  function createValidContract() {
    const renterHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
    const farmerHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
    const contract = new Contract({
      renter_id: keyutils.toPublicKeyHash(renterHdKey.publicKey)
                   .toString('hex'),
      farmer_id: keyutils.toPublicKeyHash(farmerHdKey.publicKey)
                   .toString('hex'),
      renter_hd_key: renterHdKey.publicExtendedKey,
      farmer_hd_key: farmerHdKey.publicExtendedKey,
      renter_hd_index: 1,
      farmer_hd_index: 1,
      payment_destination: '14WNyp8paus83JoDvv2SowKb3j1cZBhJoV',
      data_hash: crypto.createHash('rmd160').update('test').digest('hex')
    });
    contract.sign('renter', renterHdKey.privateKey);
    contract.sign('farmer', farmerHdKey.privateKey);
    return contract;
  }

  describe('@method offer', function() {

    it('should callback error if descriptor invalid', function(done) {
      const offers = new Map();
      const rules = new Rules({ offers });
      const request = {
        params: [
          {
            invalid: 'contract'
          }
        ],
        contact: ['identity', {}]
      };
      const response = {};
      rules.offer(request, response, (err) => {
        expect(err.message).to.equal('Invalid shard descriptor');
        done();
      });
    });

    it('should callback error if no offer stream exists', function(done) {
      const contract = createValidContract();
      const offers = new Map();
      const rules = new Rules({ offers });
      const request = {
        params: [contract.toObject()],
        contact: ['identity', {}]
      };
      const response = {};
      rules.offer(request, response, (err) => {
        expect(err.message).to.equal('Offers for descriptor are closed');
        done();
      });
    });

    it('should callback error if offer rejected', function(done) {
      const contract = createValidContract();
      const offers = new Map();
      const oStream = new OfferStream(contract);
      oStream.once('data', ({ callback }) => callback(new Error('NOPE')));
      offers.set(contract.get('data_hash'), oStream);
      const rules = new Rules({ offers });
      const request = {
        params: [contract.toObject()],
        contact: ['identity', {}]
      };
      const response = {};
      rules.offer(request, response, (err) => {
        expect(err.message).to.equal('NOPE');
        done();
      });
    });

    it('should respond with completed contract if accepted', function(done) {
      const contract = createValidContract();
      const offers = new Map();
      const oStream = new OfferStream(contract);
      oStream.once('data', ({ contract, callback: cb }) => cb(null, contract));
      offers.set(contract.get('data_hash'), oStream);
      const rules = new Rules({ offers });
      const request = {
        params: [contract.toObject()],
        contact: ['identity', {}]
      };
      const response = {
        send: ([result]) => {
          expect(JSON.stringify(result)).to.equal(
            JSON.stringify(contract.toObject())
          );
          done();
        }
      };
      rules.offer(request, response, done);
    });

  });

  describe('@method audit', function() {



  });

  describe('@method consign', function() {



  });

  describe('@method mirror', function() {



  });

  describe('@method retrieve', function() {



  });

  describe('@method probe', function() {



  });

  describe('@method trigger', function() {



  });

  describe('@method renew', function() {



  });

});
