'use strict';

var EventEmitter = require('events').EventEmitter;
var expect = require('chai').expect;
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var ContactChecker = require('../../lib/network/contactchecker');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');

describe('ContactChecker', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(ContactChecker()).to.be.instanceOf(ContactChecker);
    });

  });

  describe('#check', function() {

    it('should error if timeout', function(done) {
      var ContactChecker = proxyquire('../../lib/network/contactchecker', {
        net: {
          connect: function() {
            var c = new EventEmitter();
            c.destroy = sinon.stub();
            return c;
          }
        }
      });
      var checker = new ContactChecker({ timeout: 10 });
      checker.check(Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('')
      }), function(err) {
        expect(err.message).to.equal('Host is not reachable');
        done();
      });
    });

    it('should bubble connection error', function(done) {
      var ContactChecker = proxyquire('../../lib/network/contactchecker', {
        net: {
          connect: function() {
            var c = new EventEmitter();
            c.destroy = sinon.stub();
            setTimeout(function() {
              c.emit('error', new Error('Connection error'));
            }, 50);
            return c;
          }
        }
      });
      var checker = new ContactChecker();
      checker.check(Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('')
      }), function(err) {
        expect(err.message).to.equal('Connection error');
        done();
      });
    });

  });

});
