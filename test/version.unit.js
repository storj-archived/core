'use strict';

var proxyquire = require('proxyquire').noPreserveCache();
var expect = require('chai').expect;

describe('version', function() {

  it('should return the package version for software', function() {
    var v = proxyquire('../lib/version', {});
    expect(v.software).to.equal(require('../package').version);
  });

  it('should return the postfixed network version', function() {
    process.env.STORJ_NETWORK = 'test';
    var v = proxyquire('../lib/version', {});
    expect(v.protocol.indexOf('-test')).to.not.equal(-1);
    process.env.STORJ_NETWORK = '';
  });

});
