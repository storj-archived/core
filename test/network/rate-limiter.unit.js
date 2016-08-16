'use strict';

var RateLimiter = require('../../lib/network/rate-limiter');
var expect = require('chai').expect;
var sinon = require('sinon');
var utils = require('../../lib/utils');

describe('RateLimiter', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(RateLimiter()).to.be.instanceOf(RateLimiter);
    });

    it('should use the defaults unless options are provided', function() {
      var def = new RateLimiter();
      var opt = new RateLimiter({ rate: 1000, limit: 1 });
      expect(def.rate).to.equal(RateLimiter.DEFAULTS.rate);
      expect(def.limit).to.equal(RateLimiter.DEFAULTS.limit);
      expect(opt.rate).to.equal(1000);
      expect(opt.limit).to.equal(1);
    });

  });

  describe('#updateCounter', function() {

    it('should increment the count on the given nodeID', function() {
      var rl = new RateLimiter();
      var nid = utils.rmd160('nodeid');
      rl.updateCounter(nid);
      rl.updateCounter(nid);
      rl.updateCounter(nid);
      expect(rl._counter[nid]).to.equal(3);
    });

  });

  describe('#isLimited', function() {

    it('should return false if node has not been counted yet', function() {
      var rl = new RateLimiter();
      var nid = utils.rmd160('nodeid');
      expect(rl.isLimited(nid)).to.equal(false);
    });

    it('should return false if node has not exceeded limit', function() {
      var rl = new RateLimiter();
      var nid = utils.rmd160('nodeid');
      rl.updateCounter(nid);
      expect(rl.isLimited(nid)).to.equal(false);
    });

    it('should return true if node has exceeded limit', function() {
      var updates = 0;
      var rl = new RateLimiter();
      var nid = utils.rmd160('nodeid');
      while (updates <= rl.rate) {
        rl.updateCounter(nid);
        updates++;
      }
      expect(rl.isLimited(nid)).to.equal(true);
    });

  });

  describe('#resetCounter', function() {

    it('should reset the counter back to empty', function() {
      var rl = new RateLimiter();
      var nid = utils.rmd160('nodeid');
      rl.updateCounter(nid);
      rl.resetCounter();
      expect(Object.keys(rl._counter)).to.have.lengthOf(0);
    });

  });

  describe('#getResetTime', function() {

    it('should return the correct remaining time until reset', function() {
      var clock = sinon.useFakeTimers();
      var rl = new RateLimiter({ rate: 10000 });
      expect(rl.getResetTime()).to.equal(10000);
      clock.tick(1000);
      expect(rl.getResetTime()).to.equal(9000);
      clock.tick(15000);
      expect(rl.getResetTime()).to.equal(4000);
      clock.restore();
    });

  });

});
