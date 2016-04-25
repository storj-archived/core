'use strict';

var expect = require('chai').expect;
var kad = require('kad');
var Contact = require('../../lib/network/contact');

describe('Network/Contact', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7'
      })).to.be.instanceOf(Contact);
    });

    it('should inherit from kad.contacts.AddressPortContact', function() {
      expect(Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7'
      })).to.be.instanceOf(kad.contacts.AddressPortContact);
    });

  });

});
