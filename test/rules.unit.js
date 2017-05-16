'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const crypto = require('crypto');
const { randomBytes } = crypto;
const { utils: keyutils } = require('kad-spartacus');
const { Readable, Transform } = require('stream');
const utils = require('../lib/utils');
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
      const readStream = new Readable({
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
      const readStream = new Readable({
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

    it('should callback error if cannot load contract', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, new Error('Not found'))
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.consign(request, response, (err) => {
        expect(err.message).to.equal('Not found');
        done();
      })
    });

    it('should callback error if contract is expired', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {
            store_end: 0
          })
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.consign(request, response, (err) => {
        expect(err.message).to.equal('Contract has expired');
        done();
      });
    });

    it('should create a token and respond with it', function(done) {
      const accept = sinon.stub();
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {
            store_end: Infinity
          })
        },
        server: {
          accept: accept
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(typeof params[0]).to.equal('string');
          expect(accept.calledWithMatch(params[0])).to.equal(true);
          done();
        }
      };
      rules.consign(request, response, done);
    });

  });

  describe('@method mirror', function() {

    it('should callback error if contract cannot load', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, new Error('Not found'))
        }
      });
      const request = {
        params: [
          utils.rmd160sha256('shard'),
          'token',
          ['identity', { xpub: 'xpub' }]
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.mirror(request, response, (err) => {
        expect(err.message).to.equal('Not found');
        done();
      });
    });

    it('should callback error if shard stream cannot open', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null)
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(1, new Error('Failed'))
        }
      });
      const request = {
        params: [
          utils.rmd160sha256('shard'),
          'token',
          ['identity', { xpub: 'xpub' }]
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.mirror(request, response, (err) => {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback error if upload fails', function(done) {
      const StubbedRules = proxyquire('../lib/rules', {
        './utils': {
          rmd160: utils.rmd160,
          createShardUploader: () => {
            return new Transform({
              transform: (chunk, enc, cb) => {
                cb(new Error('Upload failed'));
              }
            })
          }
        }
      });
      const parts = [Buffer.from('hello'), null];
      const rs = new Readable({
        read: function() {
          this.push(parts.shift());
        }
      });
      const rules = new StubbedRules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null)
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(1, null, rs)
        }
      });
      const request = {
        params: [
          utils.rmd160sha256('shard'),
          'token',
          ['identity', { xpub: 'xpub' }]
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.mirror(request, response, (err) => {
        expect(err.message).to.equal('Upload failed');
        done();
      });
    });

    it('should respond acknowledgement if upload succeeds', function(done) {
      const StubbedRules = proxyquire('../lib/rules', {
        './utils': {
          rmd160: utils.rmd160,
          createShardUploader: () => {
            return new Transform({ transform: (chunk, enc, cb) => cb() })
          }
        }
      });
      const parts = [Buffer.from('hello'), null];
      const rs = new Readable({
        read: function() {
          this.push(parts.shift());
        }
      });
      const rules = new StubbedRules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null)
        },
        shards: {
          createReadStream: sinon.stub().callsArgWith(1, null, rs)
        }
      });
      const request = {
        params: [
          utils.rmd160sha256('shard'),
          'token',
          ['identity', { xpub: 'xpub' }]
        ],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params).to.have.lengthOf(0);
          done();
        }
      };
      rules.mirror(request, response, done);
    });

  });

  describe('@method retrieve', function() {

    it('should callback error if contract cannot load', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, new Error('Not found'))
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.retrieve(request, response, (err) => {
        expect(err.message).to.equal('Not found');
        done();
      });
    });

    it('should callback error if shard data not found', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {})
        },
        shards: {
          exists: sinon.stub().callsArgWith(1, null, false)
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.retrieve(request, response, (err) => {
        expect(err.message).to.equal('Shard not found');
        done();
      });
    });

    it('should create token and respond with it', function(done) {
      const accept = sinon.stub();
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, {})
        },
        shards: {
          exists: sinon.stub().callsArgWith(1, null, true)
        },
        server: {
          accept: accept
        }
      });
      const request = {
        params: ['datahash'],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(typeof params[0]).to.equal('string');
          expect(accept.calledWithMatch(params[0])).to.equal(true);
          done();
        }
      };
      rules.retrieve(request, response, done);
    });

  });

  describe('@method probe', function() {

    it('should callback error if ping fails', function(done) {
      const rules = new Rules({
        ping: sinon.stub().callsArgWith(1, new Error('Timed out'))
      });
      const request = {
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.probe(request, response, (err) => {
        expect(err.message).to.equal('Failed to reach probe originator');
        done();
      });
    });

    it('should callback empty if ping succeeds', function(done) {
      const rules = new Rules({
        ping: sinon.stub().callsArgWith(1, null, [])
      });
      const request = {
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params).to.have.lengthOf(0);
          done();
        }
      };
      rules.probe(request, response, done)
    });

  });

  describe('@method trigger', function() {

    it('should callback error if trigger fails', function(done) {
      const rules = new Rules({
        triggers: {
          process: sinon.stub().callsArgWith(3, new Error('Failed'))
        }
      });
      const request = {
        params: ['behavior', 'contents'],
        contact: ['identity', { xpub: 'xpubkey' }]
      };
      const response = {};
      rules.trigger(request, response, (err) => {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback result from trigger processing', function(done) {
      const rules = new Rules({
        triggers: {
          process: sinon.stub().callsArgWith(3, null, ['result'])
        }
      });
      const request = {
        params: ['behavior', 'contents'],
        contact: ['identity', { xpub: 'xpubkey' }]
      };
      const response = {
        send: (params) => {
          expect(params[0]).to.equal('result');
          done();
        }
      };
      rules.trigger(request, response, done);
    });

  });

  describe('@method renew', function() {

    it('should callback error if contract invalid', function(done) {
      const rules = new Rules();
      const request = {
        params: [{}],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.renew(request, response, (err) => {
        expect(err.message).to.equal('Descriptor is invalid or incomplete');
        done();
      });
    });

    it('should callback error if cannot load contract', function(done) {
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, new Error('Not found'))
        }
      });
      const request = {
        params: [createValidContract().toObject()],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.renew(request, response, (err) => {
        expect(err.message).to.equal('Not found');
        done();
      });
    });

    it('should callback error if restricted property', function(done) {
      const c1 = createValidContract();
      const c2 = createValidContract();
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, c2.toObject())
        }
      });
      const request = {
        params: [c1.toObject()],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.renew(request, response, (err) => {
        expect(err.message).to.equal('Rejecting renewal of farmer_hd_key');
        done();
      });
    });

    it('should callback error if cannot update local record', function(done) {
      const c1 = createValidContract();
      const c2 = Contract.from(c1.toObject());
      c2.set('store_end', 0);
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, c2.toObject()),
          put: sinon.stub().callsArgWith(2, new Error('Failed to write'))
        },
        spartacus: {
          privateKey: randomBytes(32)
        }
      });
      const request = {
        params: [c1.toObject()],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {};
      rules.renew(request, response, (err) => {
        expect(err.message).to.equal('Failed to write');
        done();
      });
    });

    it('should sign and echo back the renewal', function(done) {
      const c1 = createValidContract();
      const c2 = Contract.from(c1.toObject());
      c1.set('store_end', 0);
      const rules = new Rules({
        contracts: {
          get: sinon.stub().callsArgWith(1, null, c2.toObject()),
          put: sinon.stub().callsArgWith(2, null)
        },
        spartacus: {
          privateKey: randomBytes(32)
        }
      });
      const request = {
        params: [c1.toObject()],
        contact: [
          'identity',
          { xpub: 'xpubkey' }
        ]
      };
      const response = {
        send: (params) => {
          expect(params.store_end).to.equal(0);
          done();
        }
      };
      rules.renew(request, response, done);
    });

  });

});
