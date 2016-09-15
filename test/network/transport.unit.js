'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var Transport = require('../../lib/network/transport');
var Contact = require('../../lib/network/contact');
var KeyPair = require('../../lib/crypto-tools/keypair');
var proxyquire = require('proxyquire');
var kad = require('kad');

describe('Network/Transport', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), {
        noforward: true,
        tunport: 0
      })).to.be.instanceOf(Transport);
    });

  });

  describe('#_open', function() {

    it('should attempt to forward port with upnp', function(done) {
      var _forwardPort = sinon.stub(
        Transport.prototype,
        '_forwardPort'
      ).callsArg(0);
      var _checkIfReachable = sinon.stub(
        Transport.prototype,
        '_checkIfReachable'
      ).callsArgWith(0, false);
      var transport = new Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), { tunport: 0 });
      transport.on('ready', function() {
        _forwardPort.restore();
        _checkIfReachable.restore();
        expect(_forwardPort.called).to.equal(true);
        done();
      });
    });

    it('should not close the transport if already reachable', function(done) {
      var _checkIfReachable = sinon.stub(
        Transport.prototype,
        '_checkIfReachable'
      ).callsArgWith(0, true);
      var _close = sinon.stub(
        require('kad').transports.HTTP.prototype,
        '_close'
      );
      var transport = new Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }));
      transport.on('ready', function() {
        _close.restore();
        _checkIfReachable.restore();
        expect(_close.called).to.equal(false);
        done();
      });
    });

  });

  describe('#_checkIfReachable', function() {

    it('it should check the contact if address public', function(done) {
      var _check = sinon.stub().callsArg(1);
      var StubbedTransport = proxyquire('../../lib/network/transport', {
        ip: { isPrivate: sinon.stub().returns(false) },
        './contact-checker': sinon.stub().returns({
          check: _check
        })
      });
      StubbedTransport.prototype._checkIfReachable.call({
        _contact: { address: 'public.ip.address' }
      }, function() {
        done();
      });
    });

    it('it should callback true if reachable', function(done) {
      var _check = sinon.stub().callsArgWith(1, null);
      var StubbedTransport = proxyquire('../../lib/network/transport', {
        ip: { isPrivate: sinon.stub().returns(false) },
        './contact-checker': sinon.stub().returns({
          check: _check
        })
      });
      StubbedTransport.prototype._checkIfReachable.call({
        _contact: { address: 'public.ip.address' }
      }, function(result) {
        expect(result).to.equal(true);
        done();
      });
    });

    it('it should callback false if reachable', function(done) {
      var _check = sinon.stub().callsArgWith(1, new Error('Failed'));
      var StubbedTransport = proxyquire('../../lib/network/transport', {
        ip: { isPrivate: sinon.stub().returns(false) },
        './contact-checker': sinon.stub().returns({
          check: _check
        })
      });
      StubbedTransport.prototype._checkIfReachable.call({
        _contact: { address: 'public.ip.address' }
      }, function(result) {
        expect(result).to.equal(false);
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
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(false);
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
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(false);
        transport._forwardPort(function(err) {
          expect(err.message).to.equal('No IP');
          done();
        });
      });
    });

    it('should bubble private ip error', function(done) {
      var BadIPTransport = proxyquire('../../lib/network/transport', {
        'nat-upnp': {
          createClient: function() {
            return {
              portMapping: sinon.stub().callsArg(1),
              externalIp: sinon.stub().callsArgWith(0, null, '127.0.0.1')
            };
          }
        }
      });
      var transport = new BadIPTransport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(false);
        transport._forwardPort(function(err) {
          expect(err.message).to.equal('UPnP device has no public IP address');
          done();
        });
      });
    });

    it('should bubble portfinder error', function(done) {
      var BadPortFinder = proxyquire('../../lib/network/transport', {
        portfinder: {
          getPort: function(callback) {
            callback(new Error('No Port'));
          }
        }
      });
      var transport = new BadPortFinder(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(false);
        transport._forwardPort(function(err) {
          expect(err.message).to.equal('No Port');
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
        port: 4000,
        nodeID: KeyPair().getNodeID()
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(true);
        transport._forwardPort(function(err, ip, port) {
          expect(err).to.equal(null);
          expect(ip).to.equal('my.ip.address');
          expect(port).to.equal(4000);
          done();
        });
      });
    });

    it('should callback with random port', function(done) {
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
      }), { tunport: 0 });
      transport.on('ready', function() {
        expect(transport._isPublic).to.equal(true);
        transport._forwardPort(function(err, ip, port) {
          expect(err).to.equal(null);
          expect(ip).to.equal('my.ip.address');
          expect(port).to.be.at.least(1024);
          expect(port).to.be.at.most(65535);
          done();
        });
      });
    });

  });

  describe('#send', function() {

    it('should callback with error if contact is not valid', function(done) {
      Transport.prototype.send({
        address: '127.0.0.1',
        port: 0
      }, kad.Message({
        method: 'PING',
        params: {}
      }), function(err) {
        expect(err.message).to.equal('Invalid or forbidden contact address');
        done();
      });
    });

    it('should send if the message is a response', function(done) {
      var _kadHttpSend = sinon.stub(
        kad.transports.HTTP.prototype,
        'send'
      ).callsArg(2);
      Transport.prototype.send({
        address: '127.0.0.1',
        port: 0
      }, kad.Message({
        id: '1234',
        result: {}
      }), function() {
        _kadHttpSend.restore();
        done();
      });
    });

    it('should send if the message is a request and valid', function(done) {
      var _kadHttpSend = sinon.stub(
        kad.transports.HTTP.prototype,
        'send'
      ).callsArg(2);
      Transport.prototype.send({
        address: 'some.host',
        port: 80
      }, kad.Message({
        id: '1234',
        method: 'PING',
        params: {}
      }), function() {
        _kadHttpSend.restore();
        done();
      });
    });

  });

});
