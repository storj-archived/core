'use strict';

var expect = require('chai').expect;
var Network = require('../../../lib/network');
var TunnelerInterface = require('../../../lib/network/interfaces/tunneler');
var KeyPair = require('../../../lib/crypto-tools/keypair');
var kad = require('kad');

describe('TunnelerInterface', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(new TunnelerInterface({
        keypair: KeyPair(),
        port: 0,
        tunport: 0,
        logger: kad.Logger(0)
      })).to.be.instanceOf(TunnelerInterface);
    });

    it('should create instance without the new keyword', function() {
      expect(new TunnelerInterface({
        keypair: KeyPair(),
        port: 0,
        tunport: 0,
        logger: kad.Logger(0)
      })).to.be.instanceOf(TunnelerInterface);
    });

    it('should throw without a keypair', function() {
      expect(function() {
        TunnelerInterface();
      }).to.throw(Error, 'Invalid keypair supplied');
    });

    it('should inherit from network', function() {
      expect(new TunnelerInterface({
        keypair: KeyPair(),
        port: 0,
        tunport: 0,
        logger: kad.Logger(0)
      })).to.be.instanceOf(Network);
    });

  });

});
