'use strict';

var expect = require('chai').expect;
var OfferManager = require('../../lib/contract/offer-manager');

describe('OfferManager', function() {

  describe('@constructor', function() {

    it('should create a instance without the new keyword', function() {
      expect(OfferManager()).to.be.instanceOf(OfferManager);
    });

  });

});
