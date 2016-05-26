'use strict';

var expect = require('chai').expect;
var Network = require('../../lib/network');
var Manager = require('../../lib/manager');
var KeyPair = require('../../lib/keypair');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var kad = require('kad');
var sinon = require('sinon');
var version = require('../../lib/version');

describe('Network (public)', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      })).to.be.instanceOf(Network);
    });

  });

  describe('#join', function() {

    it('should add ready listener if not transport not ready', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      });
      net._ready = false;
      var _on = sinon.stub(net, 'on');
      net.join();
      setImmediate(function() {
        _on.restore();
        expect(_on.called).to.equal(true);
        done();
      });
    });

  });

  describe('#leave', function() {

    it('should call Node#disconnect', function() {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      });
      net._node = { disconnect: sinon.stub() };
      net.leave();
      expect(net._node.disconnect.called).to.equal(true);
    });

  });

});

describe('Network (private)', function() {

  describe('#_verifyMessage', function() {

    it('should fail if incompatible version', function(done) {
      var verify = Network.prototype._verifyMessage;

      verify({}, {
        protocol: '0.0.0',
        address: '127.0.0.1',
        port: 6000
      }, function(err) {
        expect(err.message).to.equal('Protocol version is incompatible');
        done();
      });
    });

    it('should fail if nonce is expired', function(done) {
      var verify = Network.prototype._verifyMessage;

      verify({
        method: 'PING',
        id: 'test',
        params: { nonce: -99999 }
      }, {
        protocol: version.protocol,
        address: '127.0.0.1',
        port: 6000
      }, function(err) {
        expect(err.message).to.equal('Message signature expired');
        done();
      });
    });

  });

  describe('#_verifySignature', function() {

    it('should fail if no signobj supplied', function(done) {
      var verify = Network.prototype._verifySignature;

      verify({}, function(err) {
        expect(err.message).to.equal('Invalid signature supplied');
        done();
      });
    });

    it('should fail if invalid signature', function(done) {
      var verify = Network.prototype._verifySignature.bind({ _pubkeys: {} });
      var msg = {
        method: 'PING',
        id: '123456',
        params: {}
      };
      Network.prototype._signMessage.call({
        _keypair: KeyPair()
      }, msg, function() {});

      verify({
        signobj: Network.prototype._createSignatureObject(
          msg.params.signature
        ),
        message: {
          id: '12345',
          params: { signature: msg.params.signature }
        },
        nonce: 12345,
        contact: { nodeID: 'nodeid' },
        signature: msg.params.signature,
        address: KeyPair().getAddress()
      }, function(err) {
        expect(err.message).to.equal('Signature verification failed');
        done();
      });
    });

  });

  describe('#_createSignatureObject', function() {

    it('should return null for an invalid signature', function() {
      expect(Network.prototype._createSignatureObject(null)).to.equal(null);
    });

  });

  describe('#_handleTransportError', function() {

    it('should send the error to the logger', function() {
      var context = { _logger: { error: sinon.stub() } };
      Network.prototype._handleTransportError.call(context, new Error('Fail'));
      expect(context._logger.error.called).to.equal(true);
    });

  });

  describe('#_checkRateLimiter', function() {

    it('should send an error message if rate limited', function() {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      });
      var _isLimited = sinon.stub(net._limiter, 'isLimited').returns(true);
      var _send = sinon.stub(net._transport, 'send');
      net._checkRateLimiter(kad.Message({
        method: 'PING',
        params: {}
      }), { nodeID: 'nodeid' });
      _isLimited.restore();
      _send.restore();
      expect(_send.called).to.equal(true);
    });

  });

  describe('#_listenForTunnelers', function() {



  });

  describe('#_setupTunnelClient', function() {



  });

  describe('#_requestProbe', function() {



  });

  describe('#_findTunnel', function() {



  });

  describe('#_establishTunnel', function() {



  });

});
