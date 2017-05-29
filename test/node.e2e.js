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
  const capacities = [];

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
    async.eachOfSeries(nodes.slice(1), (n, i, next) => {
      n.subscribeShardDescriptor(['01010202'], (err, descriptors) => {
        descriptors.on('data', ([contract, contact]) => {
          contract.set('farmer_id', n.identity.toString('hex'));
          contract.set('farmer_hd_key', n.contact.xpub);
          contract.set('farmer_hd_index', n.contact.index);
          contract.sign('farmer', n.spartacus.privateKey);
          n.offerShardAllocation(contact, contract.toObject(),
                                 () => null);
        });
        next();
      });
    }, () => setTimeout(() => done(), 1000));
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
        { maxOffers: 3 },
        (err, offerStream) => {
          offerStream.on('data', (offer) => {
            offer.contract.sign('renter', renter.spartacus.privateKey);
            offers.push(offer);
            offer.callback(null, offer.contract);
          }).on('end', () => {
            expect(offers).to.have.lengthOf(3);
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
        uploader.on('response', (res) => {
          let body = '';
          res.on('data', (data) => body += data.toString());
          res.on('end', () => {
            if (res.statusCode !== 200) {
              done(new Error(body));
            } else {
              done();
            }
          });
        });
        uploader.write(shard);
        uploader.end();
      }
    );
  });

  it('should succeed in auditing the shard', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    const farmer = offers[0].contact;
    const challenge = audit.getPrivateRecord().challenges[0];
    const hash = offers[0].contract.get('data_hash');
    renter.auditRemoteShards(farmer, [
      { hash, challenge }
    ], (err, result) => {
      expect(err).to.equal(null);
      expect(result[0].proof).to.not.equal(null);
      const proof = storj.Proof.verify(
        result[0].proof,
        audit.getPrivateRecord().root,
        audit.getPrivateRecord().depth
      );
      expect(Buffer.compare(...proof)).to.equal(0);
      done();
    });
  });

  it('should succeed in mirroring the shard', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    const source = offers[0].contact;
    const destination = offers[1].contact;
    const hash = storj.utils.rmd160sha256(shard).toString('hex');
    renter.authorizeConsignment(destination, [hash], (err, result) => {
      expect(err).to.equal(null);
      const [token] = result;
      renter.createShardMirror(source, { destination, hash, token }, (err) => {
        expect(err).to.equal(null);
        done();
      });
    });
  });

  it('should succeed in retrieving the shard from mirror', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    const mirror = offers[1].contact;
    const hash = storj.utils.rmd160sha256(shard).toString('hex');
    renter.authorizeRetrieval(mirror, [hash], (err, result) => {
      expect(err).to.equal(null);
      const [token] = result;
      const downloader = storj.utils.createShardDownloader(
        mirror,
        hash,
        token
      );
      let payload = Buffer.from([]);
      downloader.on('data', (data) => payload = Buffer.concat([payload, data]));
      downloader.on('end', () => {
        expect(shard.compare(payload)).to.equal(0);
        done();
      });
    });
  });

  it('should succeed in renewing/nullifying the contract', function(done) {
    this.timeout(6000);
    const now = Date.now();
    const renter = nodes[0];
    const farmer = offers[2].contact;
    const contract = offers[2].contract;
    contract.set('store_end', now);
    contract.sign('renter', renter.spartacus.privateKey);
    const descriptor = contract.toObject();
    renter.requestContractRenewal(farmer, descriptor, (err, result) => {
      expect(err).to.equal(undefined);
      expect(result.get('store_end')).to.equal(now);
      done();
    });
  });

  it('should succeed in subscribing to capacity', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    const farmer = nodes[1];
    renter.subscribeCapacityAnnouncement(['01010202'], (err, stream) => {
      stream.once('data', (data) => {
        capacities.push(data);
        expect(capacities[0][0]).to.equal(shard.length);
        done();
      });
    });
    farmer.publishCapacityAnnouncement('01010202', shard.length);
  });

  it('should succeed in claiming the space', function(done) {
    this.timeout(6000);
    const renter = nodes[0];
    const farmer = capacities[0][1];
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
    renter.claimFarmerCapacity(farmer, contract.toObject(), (err, result) => {
      expect(err).to.equal(null);
      const c = storj.Contract.from(result[0]);
      const t = result[1];
      const uploader = storj.utils.createShardUploader(
        farmer,
        storj.utils.rmd160sha256(shard).toString('hex'),
        t
      );
      expect(c.isComplete()).to.equal(true);
      expect(c.isValid()).to.equal(true);
      uploader.on('error', done);
      uploader.on('response', (res) => {
        let body = '';
        res.on('data', (data) => body += data.toString());
        res.on('end', () => {
          if (res.statusCode !== 200) {
            done(new Error(body));
          } else {
            done();
          }
        });
      });
      uploader.write(shard);
      uploader.end();
    });
  });

});
