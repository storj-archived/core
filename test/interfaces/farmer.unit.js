'use strict';

var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/keypair');
var FarmerInterface = require('../../lib/interfaces/farmer');
var kad = require('kad');

describe('FarmerInterface', function() {

  describe('#_negotiateContract', function() {

    it('should not send an offer if the negotiator returns false', function() {
      var farmer = new FarmerInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        negotiator: function() {
          return false;
        },
        logger: kad.Logger(0),
        backend: require('memdown')
      });
      expect(farmer._negotiateContract(Contract({}))).to.equal(false);
    });

  });

});
