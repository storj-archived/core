'use strict';

var DataChannelPointer = require('../../lib/data-channels/pointer');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');
var expect = require('chai').expect;

describe('DataChannelPointer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(DataChannelPointer(
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: utils.rmd160('nodeid')
        }),
        utils.rmd160('hash'),
        utils.generateToken(),
        'PUSH'
      )).to.be.instanceOf(DataChannelPointer);
    });

    it('should create an instance with the new keyword', function() {
      expect(new DataChannelPointer(
        Contact({
          address: '127.0.0.1',
          port: 1337,
          nodeID: utils.rmd160('nodeid')
        }),
        utils.rmd160('hash'),
        utils.generateToken()
      )).to.be.instanceOf(DataChannelPointer);
    });

    it('should throw with invalid contact', function() {
      expect(function() {
        DataChannelPointer(
          {
            address: '127.0.0.1',
            port: 1337,
            nodeID: utils.rmd160('nodeid')
          },
          utils.rmd160('hash'),
          utils.generateToken()
        );
      }).to.throw(Error, 'Invalid contact supplied');
    });

    it('should throw with invalid hash', function() {
      expect(function() {
        DataChannelPointer(
          Contact({
            address: '127.0.0.1',
            port: 1337,
            nodeID: utils.rmd160('nodeid')
          }),
          'hash',
          utils.generateToken()
        );
      }).to.throw(Error, 'Invalid hash supplied');
    });

    it('should throw with invalid token', function() {
      expect(function() {
        DataChannelPointer(
          Contact({
            address: '127.0.0.1',
            port: 1337,
            nodeID: utils.rmd160('nodeid')
          }),
          utils.rmd160('hash'),
          'token'
        );
      }).to.throw(Error, 'Invalid token supplied');
    });

  });

});
