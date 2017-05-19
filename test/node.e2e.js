'use strict';

const { expect } = require('chai');
const async = require('async');
const netgen = require('./fixtures/node-generator');
const storj = require('..');


describe('@module storj-lib (end-to-end)', function() {

  const NUM_NODES = 12;
  const nodes = [];
  const shard = Buffer.from('i am a test shard');
  const audit = new storj.Audit(4);
  const offers = [];
  const token = { consign: null, retrieve: null };

  before(function(done) {
    this.timeout(12000);
    netgen(12, (n) => {
      n.forEach((node) => nodes.push(node));
      async.eachSeries(nodes, (n, done) => {
        n.listen(n.contact.port, n.contact.hostname, done)
      }, done);
    });
  });

  after(function(done) {
    this.timeout(12000);
    setTimeout(() => {
      async.each(nodes, (n, next) => {
        n.transport.server.close();
        next();
      }, done);
    }, 4000);
  });

  it('should join all nodes together', function(done) {
    async.eachOfSeries(nodes, (n, i, next) => {
      if (i === 0) {
        next();
      } else {
        n.join([
          nodes[0].identity.toString('hex'),
          nodes[0].contact
        ], next);
      }
    }, () => {
      nodes.forEach((n) => {
        expect(n.router.size > 0.75 / NUM_NODES).to.equal(true);
      });
      done();
    });
  });

  it('should send offer for contracts received', function(done) {
    this.timeout(8000);
    async.eachOfSeries(nodes.slice(11), (n, i, next) => {
      n.subscribeShardDescriptor(['0f01010202'], (err, descriptors) => {
        descriptors.on('data', (contract) => {
          contract.set('farmer_id', n.identity.toString('hex'));
          contract.set('farmer_hd_key', n.contact.xpub);
          contract.set('farmer_hd_index', n.contact.index);
          contract.sign('farmer', n.spartacus.privateKey);
          const renterId = contract.get('renter_id');
          const renter = n.router.getContactByNodeId(renterId);
          n.offerShardAllocation([renterId, renter], contract.toObject(),
                                 () => null);
        });
        next();
      });
    }, () => setTimeout(() => done(), 4000));
  });

  it('should receive offer for contracts published', function(done) {
    this.timeout(8000);
    const renter = nodes[0];
    audit.on('finish', () => {
      const contract = new storj.Contract({
        data_hash: storj.utils.rmd160sha256(shard).toString('hex'),
        data_size: shard.length,
        renter_hd_key: renter.contact.xpub,
        renter_hd_index: renter.contact.index,
        renter_id: renter.identity.toString('hex'),
        payment_destination: 'payment address',
        payment_amount: 0,
        audit_count: 4,
        audit_leaves: audit.getPublicRecord(),
        store_begin: Date.now(),
        store_end: Date.now() + 100000
      });
      contract.sign('renter', renter.spartacus.privateKey);
      renter.publishShardDescriptor(
        contract.toObject(),
        { maxOffers: 1 },
        (err, offerStream) => {
          offerStream.once('data', (offer) => {
            offer.contract.sign('renter', renter.spartacus.privateKey);
            offers.push(offer);
            offer.callback(null, offer.contract);
            done();
          });
        }
      );
    });
    audit.end(shard);
  });

  it('should succeed in consigning shard', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    renter.authorizeConsignment(
      offers[0].contact,
      [storj.utils.rmd160sha256(shard).toString('hex')],
      (err, result) => {
        const uploader = storj.utils.createShardUploader(
          offers[0].contact,
          storj.utils.rmd160sha256(shard).toString('hex'),
          result[0]
        );
        uploader.on('error', done);
        uploader.on('finish', done);
        uploader.end(shard);
      }
    );
  });

});
