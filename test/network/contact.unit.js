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

    it('should set the hdNodeKey and hdNodeIndex property', function() {
      var hdNodeKey = '035f8a8f7153256b5605c5042a58f6efcbed57035d6aa18112ea6' +
          '6740008bf022eb9baa8887cd044fa9bf7bb6c22f3c07eec22f8386a92e43f77ce' +
          '1b5ed391ef6d';
      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
        hdNodeKey: hdNodeKey,
        hdNodeIndex: 10
      });
      expect(contact.hdNodeKey).to.equal(hdNodeKey);
      expect(contact.hdNodeIndex).to.equal(10);
    });

    it('should assert hdNodeIndex with hdNodeKey', function() {
      var hdNodeKey = '035f8a8f7153256b5605c5042a58f6efcbed57035d6aa18112ea6' +
          '6740008bf022eb9baa8887cd044fa9bf7bb6c22f3c07eec22f8386a92e43f77ce' +
          '1b5ed391ef6d';
      expect(function() {
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
          hdNodeKey: hdNodeKey
        });
      }).to.throw(Error);
    });

    it('should assert valid hdNodeIndex', function() {
      expect(function() {
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
          hdNodeKey: '035f8a8f7153256b5605c5042a58f6efcbed57035d6aa18112ea66' +
            '740008bf022eb9baa8887cd044fa9bf7bb6c22f3c07eec22f8386a92e43f77c',
          hdNodeIndex: 10
        });
      }).to.throw(Error);
    });

    it('should set hdNodeID and hdNodeIndex to undefined', function() {
      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7'
      });
      expect(contact.hdNodeKey).to.equal(undefined);
      expect(contact.hdNodeIndex).to.equal(undefined);
    });

  });

});
