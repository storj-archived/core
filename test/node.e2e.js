'use strict';

// const { expect } = require('chai');
const async = require('async');
const netgen = require('./fixtures/node-generator');
// const storj = require('..');


describe('@module storj-lib (end-to-end)', function() {

  let nodes;

  before(function(done) {
    this.timeout(12000);
    netgen(12, (n) => {
      nodes = n;
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
    }, done);
  });

});
