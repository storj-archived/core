'use strict';
/* jshint maxstatements: false */

var sinon = require('sinon');
var expect = require('chai').expect;
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var Network = proxyquire('../../lib/network', {
  './contactchecker': function() {
    var emitter = new EventEmitter();
    emitter.check = sinon.stub().callsArgWith(1, null);
    return emitter;
  }
});
var Manager = require('../../lib/manager');
var KeyPair = require('../../lib/keypair');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var kad = require('kad');
var version = require('../../lib/version');
var utils = require('../../lib/utils');
var version = require('../../lib/version');
var Contact = require('../../lib/network/contact');
var constants = require('../../lib/constants');

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
        tunport: 0,
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
        tunport: 0,
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

    it('should callback with error if tunnel setup fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArgWith(
        0,
        new Error('Failed')
      );
      var _enterOverlay = sinon.stub(net, '_enterOverlay').callsArg(0);
      net.join(function() {
        _setupTunnel.restore();
        _enterOverlay.restore();
        expect(_enterOverlay.called).to.equal(false);
        done();
      });
    });

    it('should callback with error if db open fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _open = sinon.stub(net._manager, 'open').callsArgWith(
        0,
        new Error('Failed')
      );
      net.join(function(err) {
        _open.restore();
        expect(err.message).to.equal('Failed');
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
        tunport: 0,
        noforward: true
      });
      net._node = { disconnect: sinon.stub() };
      net.leave();
      expect(net._node.disconnect.called).to.equal(true);
    });

    it('should close the tunnel client if it is open', function() {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        noforward: true
      });
      net._tunclient = {
        status: 1,
        close: sinon.stub(),
        removeAllListeners: sinon.stub()
      };
      net._node = { disconnect: sinon.stub() };
      net.leave();
      expect(net._tunclient.close.called).to.equal(true);
    });

    it('should callback with error if db close fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _close = sinon.stub(net._manager, 'close').callsArgWith(
        0,
        new Error('Failed')
      );
      net.leave(function(err) {
        _close.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

});

describe('Network (private)', function() {

  describe('#_validateContact', function() {


    it('should return an error if the contact is invalid', function(done) {
      var _removeContact = sinon.stub();
      var _validateContact = Network.prototype._validateContact.bind({
        _router: {
          removeContact: _removeContact
        }
      });
      _validateContact({
        address: '127.0.0.1',
        port: 0,
        nodeID: utils.rmd160('nodeid'),
        protocol: version.protocol
      }, function(err) {
        expect(err.message).to.equal('Invalid contact data supplied');
        expect(_removeContact.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_verifyMessage', function() {

    it('should fail if incompatible version', function(done) {
      var _removeContact = sinon.stub();
      var verify = Network.prototype._verifyMessage.bind({
        _router: {
          removeContact: _removeContact
        },
        _validateContact: Network.prototype._validateContact
      });

      verify({}, {
        protocol: '0.0.0',
        address: '127.0.0.1',
        port: 6000
      }, function(err) {
        expect(_removeContact.called).to.equal(true);
        expect(err.message).to.equal('Protocol version is incompatible');
        done();
      });
    });

    it('should fail if nonce is expired', function(done) {
      var verify = Network.prototype._verifyMessage.bind({
        _validateContact: Network.prototype._validateContact
      });

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

  describe('#_signMessage', function() {

    it('should throw an error if there is an issue with sign', function(done) {

      var msg = {
        method: 'PING',
        id: '123456',
        params: {}
      };

      var StubbedKeyPair = proxyquire('../../lib/keypair', {
          'bitcore-message': function() {
            return {
              sign: sinon.stub().throws(
                new Error('Point does not lie on the curve')
              )
            };
          }
      });

      Network.prototype._signMessage.call({
        _keypair: StubbedKeyPair()
      }, msg, function(err) {
        expect(err.message).to.equal('Point does not lie on the curve');
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
        tunport: 0,
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

    it('should announce unavailable tunnels', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true,
        tunnels: 1
      });
      var emitter = new EventEmitter();
      var _hasTunnel = sinon.stub(
        net._transport._tunserver,
        'hasTunnelAvailable'
      ).returns(false);
      var _pub = sinon.stub(net._pubsub, 'publish');
      var _sub = sinon.stub(net._pubsub, 'subscribe');
      net._listenForTunnelers();
      emitter.emit('unlocked');
      setImmediate(function() {
        _hasTunnel.restore();
        _pub.restore();
        _sub.restore();
        expect(_pub.args[0][0]).to.equal('0e00');
        done();
      });
    });

    it('should remove the oldest tunneler to add the new one', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true,
        tunnels: 0
      });
      var _acCallCount = 0;
      var _getSize = sinon.stub(net._tunnelers, 'getSize').returns(20);
      var _addContact = sinon.stub(net._tunnelers, 'addContact', function() {
        _acCallCount++;

        if (_acCallCount === 1) {
          return false;
        }

        return true;
      });
      var _removeContact = sinon.stub(net._tunnelers, 'removeContact');
      var _indexOf = sinon.stub(net._tunnelers, 'getContact').returns(Contact({
        address: '127.0.0.1',
        port: 1338,
        nodeID: utils.rmd160('nodeid1'),
        protocol: version.protocol
      }));
      var _subscribe = sinon.stub(net._pubsub, 'subscribe', function(t, cb) {
        if (t === '0e01') {
          cb({
            address: '127.0.0.1',
            port: 1337,
            nodeID: utils.rmd160('nodeid'),
            protocol: version.protocol
          });
        }
      });
      net._listenForTunnelers();
      setImmediate(function() {
        _getSize.restore();
        _addContact.restore();
        _subscribe.restore();
        _indexOf.restore();
        expect(_removeContact.called).to.equal(true);
        expect(_addContact.callCount).to.equal(2);
        done();
      });
    });

    it('should remove contact when publish received', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true,
        tunnels: 0
      });
      var _removeContact = sinon.stub(net._tunnelers, 'removeContact');
      var _subscribe = sinon.stub(net._pubsub, 'subscribe', function(t, cb) {
        if (t === '0e00') {
          cb({
            address: '127.0.0.1',
            port: 1337,
            nodeID: utils.rmd160('nodeid'),
            protocol: version.protocol
          });
        }
      });
      net._listenForTunnelers();
      setImmediate(function() {
        _removeContact.restore();
        _subscribe.restore();
        expect(_removeContact.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_setupTunnelClient', function() {

    it('should callback error if no seed or bridge provided', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true,
        bridge: false
      });
      net._transport._isPublic = false;
      net._setupTunnelClient(function(err) {
        expect(err.message).to.equal(
          'Could not find a neighbor to query for probe'
        );
        done();
      });
    });

    it('should use the bridge seed for probe in none provided', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _bridge = sinon.stub(net._bridge, 'getInfo').callsArgWith(0, null, {
        info: {
          'x-network-seeds': [
            'storj://127.0.0.1:8080/' + utils.rmd160('nodeid')
          ]
        }
      });
      var _probe = sinon.stub(net, '_requestProbe').callsArgWith(1, null, {});
      net._transport._isPublic = false;
      net._setupTunnelClient(function() {
        _bridge.restore();
        _probe.restore();
        expect(_probe.called).to.equal(true);
        done();
      });
    });

    it('should use the bridge seed for probe in none provided', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _bridge = sinon.stub(net._bridge, 'getInfo').callsArgWith(
        0,
        new Error('Failed')
      );
      net._transport._isPublic = false;
      net._setupTunnelClient(function(err) {
        _bridge.restore();
        expect(err.message).to.equal('Failed to get seeds for probe');
        done();
      });
    });


    it('should try to find a tunnel if probe fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [
          'storj://127.0.0.1:1337/adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        ],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      net._transport._isPublic = false;
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { error: true }
      );
      var _findTunnel = sinon.stub(net, '_findTunnel').callsArg(1);
      net._setupTunnelClient(function() {
        _send.restore();
        _findTunnel.restore();
        expect(_findTunnel.called).to.equal(true);
        done();
      });
    });

    it('should listen for tunnelers if probe succeeds', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [
          'storj://127.0.0.1:1337/adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        ],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      net._transport._isPublic = false;
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        {}
      );
      var _listen = sinon.stub(net, '_listenForTunnelers');
      net._setupTunnelClient(function() {
        _listen.restore();
        _send.restore();
        expect(_listen.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_requestProbe', function() {

    it('should send a probe message to the contact', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArg(2);
      var contact = { address: '127.0.0.1', port: 1337 };
      net._requestProbe(contact, function() {
        _send.restore();
        expect(_send.args[0][1].method).to.equal('PROBE');
        done();
      });
    });

  });

  describe('#_findTunnel', function() {

    it('should callback error if no neighbors provided', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      net._findTunnel([], function(err) {
        expect(err.message).to.equal(
          'Could not find a neighbor to query for tunnels'
        );
        done();
      });
    });

    it('should try all neighbors for tunnel list', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnels: [] } }
      );
      var contact = { address: '127.0.0.1', port: 1337 };
      net._findTunnel([contact, contact], function(err) {
        _send.restore();
        expect(_send.callCount).to.equal(2);
        expect(err.message).to.equal(
          'Failed to find tunnels from neighbors'
        );
        done();
      });
    });

    it('should callback error if send fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        new Error('Not reachable')
      );
      var contact = { address: '127.0.0.1', port: 1337 };
      net._findTunnel([contact], function(err) {
        _send.restore();
        expect(err.message).to.equal(
          'Failed to find tunnels from neighbors'
        );
        done();
      });
    });

  });

  describe('#_establishTunnel', function() {

    it('should callback with error if no tunnels supplied', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      net._establishTunnel([], function(err) {
        expect(err.message).to.equal(
          'Failed to establish tunnel, reason: No tunnelers were returned'
        );
        done();
      });
    });

    it('should callback with error if the tunnel fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        new Error('Failed')
      );
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function(err) {
        _send.restore();
        expect(err.message).to.equal(
          'Failed to establish tunnel, reason: No tunnelers were returned'
        );
        done();
      });
    });

    it('should not try to tunnel if server is closed', function(done) {
      var net = new Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnel: true, alias: true } }
      );
      var _addr = sinon.stub(net._transport._server, 'address').returns(null);
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function(err) {
        _addr.restore();
        _send.restore();
        expect(err.message).to.equal(
          'Local transport not initialized, refusing to establish new tunnel'
        );
        done();
      });
    });

    it('should try to re-establish tunnel on check fail', function(done) {
      var emitter = new EventEmitter();
      emitter.open = function() {
        emitter.emit('open');
      };
      emitter.close = function() {
        emitter.emit('close');
      };
      var TunClientStubNetwork = proxyquire('../../lib/network', {
        '../tunnel/client': function() {
          return emitter;
        },
        './contactchecker': function() {
          var emitter = new EventEmitter();
          emitter.check = sinon.stub().callsArgWith(1, new Error('Failed'));
          return emitter;
        }
      });
      var net = TunClientStubNetwork({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnel: true, alias: true } }
      );
      var _requestProbe = sinon.stub(net, '_requestProbe').callsArgWith(
        1,
        new Error('Failed probe')
      );
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function() {
        _send.restore();
        _requestProbe.restore();
        var _establishTunnel = sinon.stub(net, '_establishTunnel');
        emitter.emit('open');
        setImmediate(function() {
          setImmediate(function() {
            _establishTunnel.restore();
            expect(_establishTunnel.called).to.equal(true);
            done();
          });
        });
      });
    });

    it('should try to re-establish tunnel on close', function(done) {
      var emitter = new EventEmitter();
      emitter.open = function() {
        emitter.emit('open');
      };
      var TunClientStubNetwork = proxyquire('../../lib/network', {
        '../tunnel/client': function() {
          return emitter;
        },
        './contactchecker': function() {
          var emitter = new EventEmitter();
          emitter.check = sinon.stub().callsArgWith(1, null);
          return emitter;
        }
      });
      var net = TunClientStubNetwork({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnel: true, alias: true } }
      );
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function() {
        _send.restore();
        var _establishTunnel = sinon.stub(net, '_establishTunnel');
        emitter.emit('close');
        setImmediate(function() {
          _establishTunnel.restore();
          expect(_establishTunnel.called).to.equal(true);
          done();
        });
      });
    });

    it('should try to re-establish tunnel on error', function(done) {
      var emitter = new EventEmitter();
      emitter.open = function() {
        emitter.emit('open');
      };
      var TunClientStubNetwork = proxyquire('../../lib/network', {
        '../tunnel/client': function() {
          return emitter;
        },
        './contactchecker': function() {
          var emitter = new EventEmitter();
          emitter.check = sinon.stub().callsArgWith(1, null);
          return emitter;
        }
      });
      var net = TunClientStubNetwork({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _send = sinon.stub(net._transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnel: true, alias: true } }
      );
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function() {
        _send.restore();
        var _establishTunnel = sinon.stub(net, '_establishTunnel');
        emitter.emit('error', new Error('Failed'));
        setImmediate(function() {
          _establishTunnel.restore();
          expect(_establishTunnel.called).to.equal(true);
          done();
        });
      });
    });

  });

  describe('#_enterOverlay', function() {

    it('should use bridge to get seeds and error if fails', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArg(0);
      var _getContactList = sinon.stub(
        net._bridge,
        'getContactList'
      ).callsArgWith(1, new Error('connection refused'));
      net.join(function(err) {
        _setupTunnel.restore();
        _getContactList.restore();
        expect(err.message).to.equal(
          'Failed to discover seeds from bridge: connection refused'
        );
        done();
      });
    });

    it('should use bridge to get seeds and use them', function(done) {
      this.timeout(4000);
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArg(0);
      var _getContactList = sinon.stub(
        net._bridge,
        'getContactList'
      ).callsArgWith(1, null, []);
      net.join(function() {
        _setupTunnel.restore();
        _getContactList.restore();
        done();
      });
    });

    it('should do nothing if no seeds or bridge', function(done) {
      this.timeout(4000);
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        bridge: false,
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArg(0);
      net.join(function() {
        _setupTunnel.restore();
        done();
      });
    });

    it('should try all seeds before failing to connect', function(done) {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [
          'storj://127.0.0.1:1337/' + utils.rmd160('nodeid1'),
          'storj://127.0.0.1:1338/' + utils.rmd160('nodeid2'),
          'storj://127.0.0.1:1339/' + utils.rmd160('nodeid3')
        ],
        bridge: false,
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      var _connect = sinon.stub(net, 'connect').callsArgWith(
        1,
        new Error('Failed')
      );
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArg(0);
      net.join(function() {
        _connect.restore();
        _setupTunnel.restore();
        expect(_connect.callCount).to.equal(3);
        done();
      });

    });

  });

});

describe('Network (private/jobs)', function() {

  describe('#_startRouterCleaner', function() {

    it('should call _cleanRoutingTable', function(done) {
      constants.ROUTER_CLEAN_INTERVAL = 10;
      var _cleanRoutingTable = sinon.stub(
        Network.prototype,
        '_cleanRoutingTable'
      ).returns([]);
      Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        bridge: false,
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      setTimeout(function() {
        _cleanRoutingTable.restore();
        constants.ROUTER_CLEAN_INTERVAL = 60000;
        expect(_cleanRoutingTable.called).to.equal(true);
        done();
      }, 20);
    });

  });

  describe('#_cleanRoutingTable', function() {

    it('should drop the contacts with bad address or version', function() {
      var net = Network({
        keypair: KeyPair(),
        manager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seeds: [],
        bridge: false,
        address: '127.0.0.1',
        port: 0,
        tunport: 0,
        noforward: true
      });
      net._router._buckets[0] = new kad.Bucket();
      net._router._buckets[2] = new kad.Bucket();
      net._router._buckets[0].addContact(Contact({
        address: 'some.public.ip',
        port: 80,
        nodeID: kad.utils.createID('node1'),
        protocol: version.protocol
      }));
      net._router._buckets[2].addContact(Contact({
        address: 'some.public.ip',
        port: 81,
        nodeID: kad.utils.createID('node2'),
        protocol: '0.0.0'
      }));
      net._router._buckets[2].addContact(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: kad.utils.createID('node3'),
        protocol: version.protocol
      }));
      var dropped = net._cleanRoutingTable();
      expect(dropped).to.have.lengthOf(2);
      expect(net._router._buckets[0].getSize()).to.equal(1);
      expect(net._router._buckets[2].getSize()).to.equal(0);
    });

  });


});
