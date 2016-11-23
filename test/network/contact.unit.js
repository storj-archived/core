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

    it('should set the hdKey and hdIndex property', function() {
      var hdKey = 'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnL' +
          'Fbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt';
      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
        hdKey: hdKey,
        hdIndex: 10
      });
      expect(contact.hdKey).to.equal(hdKey);
      expect(contact.hdIndex).to.equal(10);
    });

    it('should assert hdIndex with hdKey', function() {
      var hdKey = 'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnL' +
          'Fbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt';
      expect(function() {
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
          hdKey: hdKey
        });
      }).to.throw(Error);
    });

    it('should assert valid hdIndex', function() {
      expect(function() {
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
          hdKey: '035f8a8f7153256b5605c5042a58f6efcbed57035d6aa18112ea66' +
            '740008bf022eb9baa8887cd044fa9bf7bb6c22f3c07eec22f8386a92e43f77c',
          hdIndex: -10
        });
      }).to.throw(Error);
    });

    it('should set hdKey and hdIndex to undefined', function() {
      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7'
      });
      expect(contact.hdKey).to.equal(undefined);
      expect(contact.hdIndex).to.equal(undefined);
    });

  });

});
