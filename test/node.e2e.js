'use strict';

const { expect } = require('chai');
const async = require('async');
const netgen = require('./fixtures/node-generator');
// const storj = require('..');


describe('@module storj-lib (end-to-end)', function() {

  const NUM_NODES = 12;
  const nodes = [];

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
    async.each(nodes, (n, next) => {
      n.transport.server.close();
      next();
    }, done);
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

  it('should subscribe farmers to the topic', function(done) {
    this.timeout(0);
    async.eachOfSeries(nodes.slice(11), (n, i, next) => {
      n.subscribeShardDescriptor(['0f02020202'], (err, descriptors) => {
        descriptors.on('data', ({ contract, callback }) => {
          contract.set('farmer_id', n.identity.toString('hex'));
          contract.set('farmer_hd_key', n.contact.xpub);
          contract.set('farmer_hd_index', n.contact.index);
          contract.sign('farmer', n.spartacus.privateKey);
          callback(null, contract);
        });
        next();
      });
    }, done);
  });

});
