'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const crypto = require('crypto');
const { utils: keyutils } = require('kad-spartacus');
const { Readable: ReadableStream } = require('stream');
const OfferStream = require('../lib/offers');
const AuditStream = require('../lib/audit');
const ProofStream = require('../lib/proof');
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

    let auditStream = null;
    let dataShard = Buffer.from('this is a test shard');

    before(function(done) {
      auditStream = new AuditStream(2);
      auditStream.on('finish', done).end(dataShard);
    });

    it('should callback error if invalid audit batch', function(done) {
      const rules = new Rules({});
      const request = {
        params: {},
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.audit(request, response, (err) => {
        expect(err.message).to.equal('Invalid audit batch supplied');
        done();
      });
    });

    it('should return null if cannot load contract', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, new Error('Not found'))
        }
      });
      const request = {
        params: [
          { hash: 'datahash', challenge: 'challengerequest' }
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params[0].hash).to.equal('datahash');
          expect(params[0].proof).to.equal(null);
          done();
        }
      };
      rules.audit(request, response, done);
    });

    it('should return null if cannot load shard', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, { data_hash: 'datahash'})
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(
            1,
            new Error('Not found')
          )
        }
      });
      const request = {
        params: [
          { hash: 'datahash', challenge: 'challengerequest' }
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params[0].hash).to.equal('datahash');
          expect(params[0].proof).to.equal(null);
          done();
        }
      };
      rules.audit(request, response, done);
    });

    it('should return null if proof fails', function(done) {
      const shardParts = [dataShard];
      const readStream = new ReadableStream({
        read: function() {
          if (shardParts.length) {
            this.push(shardParts.shift());
          } else {
            this.push(null);
          }
        }
      });
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {
            data_hash: 'datahash',
            audit_leaves: auditStream.getPublicRecord()
          })
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(1, null, readStream)
        }
      });
      const request = {
        params: [{ hash: 'datahash', challenge: '00000000' }],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params[0].proof).to.equal(null);
          done();
        }
      };
      rules.audit(request, response);
    });

    it('should return { hash, proof } if successful', function(done) {
      const shardParts = [dataShard];
      const readStream = new ReadableStream({
        read: function() {
          if (shardParts.length) {
            this.push(shardParts.shift());
          } else {
            this.push(null);
          }
        }
      });
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {
            data_hash: 'datahash',
            audit_leaves: auditStream.getPublicRecord()
          })
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(1, null, readStream)
        }
      });
      const request = {
        params: [
          {
            hash: 'datahash',
            challenge: auditStream.getPrivateRecord().challenges[0]
          }
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          let { proof } = params[0];
          let { root, depth } = auditStream.getPrivateRecord();
          let [expected, actual] = ProofStream.verify(proof, root, depth);
          expect(Buffer.compare(expected, actual)).to.equal(0);
          done();
        }
      };
      rules.audit(request, response);
    });

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
