'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var Transport = require('../../lib/network/transport');
var Contact = require('../../lib/network/contact');
var KeyPair = require('../../lib/keypair');
var proxyquire = require('proxyquire');

describe('Network/Transport', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), {
        noforward: true
      })).to.be.instanceOf(Transport);
    });

  });

  describe('#_open', function() {

    it('should attempt to forward port with upnp', function(done) {
      var _forwardPort = sinon.stub(
        Transport.prototype,
        '_forwardPort'
      ).callsArg(0);
      var transport = new Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }));
      transport.on('ready', function() {
        expect(_forwardPort.called).to.equal(true);
        _forwardPort.restore();
        done();
      });
    });

  });

  describe('#_forwardPort', function() {

    it('should bubble port mapping error', function(done) {
      var BadPortMapTransport = proxyquire('../../lib/network/transport', {
        'nat-upnp': {
          createClient: function() {
            return {
              portMapping: sinon.stub().callsArgWith(1, new Error('No map'))
            };
          }
        }
      });
      var transport = new BadPortMapTransport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }));
      transport.on('ready', function() {
        expect(transport._portMapped).to.equal(false);
        transport._forwardPort(function(err) {
          expect(err.message).to.equal('No map');
          done();
        });
      });
    });

    it('should bubble external ip error', function(done) {
      var BadIPTransport = proxyquire('../../lib/network/transport', {
        'nat-upnp': {
          createClient: function() {
            return {
              portMapping: sinon.stub().callsArg(1),
              externalIp: sinon.stub().callsArgWith(0, new Error('No IP'))
            };
          }
        }
      });
      var transport = new BadIPTransport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }));
      transport.on('ready', function() {
        expect(transport._portMapped).to.equal(false);
        transport._forwardPort(function(err) {
          expect(err.message).to.equal('No IP');
          done();
        });
      });
    });

    it('should callback with external ip', function(done) {
      var GoodTransport = proxyquire('../../lib/network/transport', {
        'nat-upnp': {
          createClient: function() {
            return {
              portMapping: sinon.stub().callsArg(1),
              externalIp: sinon.stub().callsArgWith(0, null, 'my.ip.address')
            };
          }
        }
      });
      var transport = new GoodTransport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }));
      transport.on('ready', function() {
        expect(transport._portMapped).to.equal(true);
        transport._forwardPort(function(err, ip) {
          expect(err).to.equal(null);
          expect(ip).to.equal('my.ip.address');
          done();
        });
      });
    });

  });

});
