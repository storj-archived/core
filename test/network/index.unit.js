'use strict';

/* jshint maxstatements: false */

var util = require('util');
var sinon = require('sinon');
var expect = require('chai').expect;
var secp256k1 = require('secp256k1');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var Network = require('../../lib/network');
var Manager = require('../../lib/storage/manager');
var HDKey = require('hdkey');
var KeyPair = require('../../lib/crypto-tools/keypair');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var kad = require('kad');
var version = require('../../lib/version');
var utils = require('../../lib/utils');
var Contact = require('../../lib/network/contact');
var constants = require('../../lib/constants');
var async = require('async');
var _ntp = null;
var VERSION = require('../../lib/version');
var CLEANUP = [];

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
    'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
    'ce8af';

var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
var hdKey = masterKey.derive('m/3000\'/0\'');
var nodeHdKey = hdKey.deriveChild(10);

var pub = '02ad47e0d4896cd794f5296a953f897c426b3f9a58f5203b8baace8952a291cf6b';

describe('Network (public)', function() {

  before(function() {
    _ntp = sinon.stub(utils, 'ensureNtpClockIsSynchronized').callsArgWith(
      0,
      null
    );
  });

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      expect(net).to.be.instanceOf(Network);
    });

    it('should create network with SIP32 contact', function() {
      var net = Network({
        hdKey: hdKey.privateExtendedKey,
        hdIndex: 10,
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      expect(net).to.be.instanceOf(Network);
      expect(net.contact.hdKey).to.equal(hdKey.publicExtendedKey);
      expect(net.contact.hdIndex).to.equal(10);
    });

  });

  describe('#connect', function() {

    it('should not call #node#connect', function() {
      var _connect = sinon.stub();
      var _warn = sinon.stub();
      Network.prototype.connect.call({
        node: { connect: _connect },
        _logger: {
          warn: _warn
        }
      }, 'http://127.0.0.1:1337');
      expect(_connect.called).to.equal(false);
      expect(_warn.called).to.equal(true);
    });

    it('should call #node#connect', function(done) {
      var _connect = sinon.stub().callsArg(1);
      var _info = sinon.stub();
      Network.prototype.connect.call({
        node: { connect: _connect },
        _logger: { info: _info }
      }, 'storj://127.0.0.1:1337/f39bc0ae7b79e89dca5100d7577fde0559bcda8c');
      expect(_connect.called).to.equal(true);
      setImmediate(() => {
        expect(_info.called).to.equal(true);
        done();
      });
    });

  });

  describe('#publish', function() {

    it('should call #_pubsub#publish', function() {
      var _publish = sinon.stub();
      Network.prototype.publish.call({
        _pubsub: { publish: _publish }
      });
      expect(_publish.called).to.equal(true);
    });

  });

  describe('#subscribe', function() {

    it('should call #_pubsub#publish', function() {
      var _subscribe = sinon.stub();
      Network.prototype.subscribe.call({
        _pubsub: { subscribe: _subscribe }
      });
      expect(_subscribe.called).to.equal(true);
    });

  });

  describe('#join', function() {

    it('should add ready listener if not transport not ready', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net._ready = false;
      var _on = sinon.stub(net, 'on');
      net.join();
      setImmediate(function() {
        _on.restore();
        expect(_on.called).to.equal(true);
        done();
      });
    });

    it('should callback after listening for tunnelers', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      net._isPublic = true;
      CLEANUP.push(net);
      var _listenForTunnelers = sinon.stub(net, '_listenForTunnelers');
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArgWith(
        0,
        null
      );
      var _enterOverlay = sinon.stub(net, '_enterOverlay').callsArg(0);
      net.join(function() {
        _setupTunnel.restore();
        _enterOverlay.restore();
        _listenForTunnelers.restore();
        expect(_listenForTunnelers.called).to.equal(true);
        expect(_enterOverlay.called).to.equal(true);
        done();
      });

    });

    it('should callback with error if tunnel setup fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
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
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _open = sinon.stub(net.storageManager, 'open').callsArgWith(
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
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net.node = { disconnect: sinon.stub() };
      net.leave();
      expect(net.node.disconnect.called).to.equal(true);
    });

    it('should callback with error if Node#disconnect fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net.node = {
        disconnect: sinon.stub().callsArgWith(0, new Error('Failed'))
      };
      net.leave(function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback on successful disconnect', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net.node = {
        disconnect: sinon.stub().callsArgWith(0, null)
      };
      net.leave(function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should callback with error if db close fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _close = sinon.stub(net.storageManager, 'close').callsArgWith(
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

  describe('#_warnIfClockNotSynced', function() {

    it('should warn if there is an error with ntp server', function(done) {
      var _warn = sinon.stub();
      var StubNet = proxyquire('../../lib/network', {
        '../utils': {
          ensureNtpClockIsSynchronized: sinon.stub().callsArgWith(
            0,
            new Error('Timeout')
          )
        }
      });
      var _warnIfClockNotSynced = StubNet.prototype._warnIfClockNotSynced.bind(
        {
          _logger: { warn: _warn }
        }
      );
      _warnIfClockNotSynced(function() {
        expect(_warn.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_initKeyPair', function() {

    it('it will derive keyPair and set hdKey and hdIndex', function() {
      var obj = {};
      var initKeyPair = Network.prototype._initKeyPair.bind(obj);
      initKeyPair({
        hdKey: hdKey.privateExtendedKey,
        hdIndex: 3
      });
      expect(obj.hdKey).to.be.instanceOf(HDKey);
      expect(obj.hdIndex).to.equal(3);
      expect(obj.keyPair).to.be.instanceOf(KeyPair);
    });

    it('it will fail if given public extended key', function() {
      var obj = {};
      var initKeyPair = Network.prototype._initKeyPair.bind(obj);
      expect(function() {
        initKeyPair({
          hdKey: hdKey.publicExtendedKey,
          hdIndex: 3
        });
      }).to.throw(Error);
    });

    it('it will set keyPair', function() {
      var keyPair = new KeyPair();
      var obj = {};
      var initKeyPair = Network.prototype._initKeyPair.bind(obj);
      initKeyPair({
        keyPair: keyPair
      });
      expect(obj.keyPair).to.be.instanceOf(KeyPair);
      expect(obj.keyPair).to.equal(keyPair);
    });

  });

  describe('#_validateContact', function() {

    it('should return an error if the contact is invalid', function(done) {
      var _removeContact = sinon.stub();
      var _validateContact = Network.prototype._validateContact.bind({
        router: {
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

    it('should callback null if valid and compatible', function(done) {
      var _isCompatibleVersion = sinon.stub(
        utils,
        'isCompatibleVersion'
      ).returns(true);
      var _isValidContact = sinon.stub(utils, 'isValidContact').returns(true);
      Network.prototype._validateContact.call({}, {
        address: '127.0.0.1',
        port: 80,
        nodeID: utils.rmd160('')
      }, function(err) {
        _isValidContact.restore();
        _isCompatibleVersion.restore();
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#_verifyMessage', function() {

    it('should fail if incompatible version', function(done) {
      var _removeContact = sinon.stub();
      var verify = Network.prototype._verifyMessage.bind({
        router: {
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
      var _removeContact = sinon.stub();
      var verify = Network.prototype._verifyMessage.bind({
        router: {
          removeContact: _removeContact
        },
        _validateContact: sinon.stub().callsArg(1)
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

    it('should call #_verifySignature', function(done) {
      var verify = Network.prototype._verifyMessage.bind({
        _validateContact: sinon.stub().callsArg(1),
        _verifySignature: sinon.stub().callsArg(1),
        _createSignatureObject: sinon.stub()
      });
      verify({
        method: 'PING',
        id: 'test',
        params: {
          nonce: Date.now(),
          signature: 'signature'
        }
      }, {
        protocol: version.protocol,
        address: '127.0.0.1',
        port: 6000,
        nodeID: utils.rmd160('')
      }, function(err) {
        expect(err).to.equal(undefined);
        done();
      });
    });

  });

  describe('#_verifySignature', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });

    it('should fail if no signobj supplied', function(done) {
      var verify = Network.prototype._verifySignature;

      verify({}, function(err) {
        expect(err.message).to.equal('Invalid signature supplied');
        done();
      });
    });

    it('should pass if valid signature', function(done) {
      var verify = Network.prototype._verifySignature.bind({
        _pubkeys: {},
        _verifyHDKeyContact: sinon.stub().returns(true)
      });
      var kp = KeyPair();
      var msg = {
        method: 'PING',
        id: '12345',
        params: {}
      };
      Network.prototype._signMessage.call({
        keyPair: kp
      }, msg, function() {});
      verify({
        signobj: Network.prototype._createSignatureObject(
          msg.params.signature
        ),
        message: {
          id: '12345',
          params: { signature: msg.params.signature }
        },
        nonce: msg.params.nonce,
        contact: { nodeID: 'nodeid' },
        signature: msg.params.signature,
        address: kp.getAddress()
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should fail if invalid signature', function(done) {
      var verify = Network.prototype._verifySignature.bind({
        _pubkeys: {},
      });
      sandbox.stub(secp256k1, 'recover').returns(new Buffer(pub, 'hex'));
      var msg = {
        method: 'PING',
        id: '123456',
        params: {}
      };
      Network.prototype._signMessage.call({
        keyPair: KeyPair()
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

    it('should callback with error if secp256k1 throws', function(done) {
      var error = new Error('Something about points and curves...');
      sandbox.stub(secp256k1, 'recover').throws(error);
      var verify = Network.prototype._verifySignature.bind({
        _pubkeys: {}
      });
      var msg = {
        method: 'PING',
        id: '123456',
        params: {}
      };
      Network.prototype._signMessage.call({
        keyPair: KeyPair()
      }, msg, function() {});

      var sigobj = Network.prototype._createSignatureObject(
        msg.params.signature
      );
      verify({
        signobj: sigobj,
        message: {
          id: '123456',
          method: 'PING',
          params: { signature: msg.params.signature }
        },
        nonce: 12345,
        contact: { nodeID: 'nodeid' },
        signature: msg.params.signature,
        address: KeyPair().getAddress()
      }, function(err) {
        expect(err.message).to.equal('Something about points and curves...');
        done();
      });
    });

    it('should verify a signature with hd contact', function(done) {
      var verify = Network.prototype._verifySignature.bind({
        _pubkeys: {},
        _verifyHDKeyContact: sinon.stub().returns(true)
      });

      var msg = {
        method: 'PING',
        id: '12345',
        params: {}
      };

      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });

      var kp = KeyPair(nodeHdKey.privateKey.toString('hex'));

      Network.prototype._signMessage.call({
        keyPair: kp
      }, msg, function() {});

      verify({
        signobj: Network.prototype._createSignatureObject(
          msg.params.signature
        ),
        message: {
          id: '12345',
          params: { signature: msg.params.signature }
        },
        nonce: msg.params.nonce,
        contact: contact,
        signature: msg.params.signature,
        address: kp.getAddress()
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should NOT verify a signature with hd contact', function(done) {
      var verify = Network.prototype._verifySignature.bind({
        _pubkeys: {},
        _verifyHDKeyContact: sinon.stub().returns(false)
      });

      var msg = {
        method: 'PING',
        id: '12345',
        params: {}
      };

      var contact = Contact({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '1261d3f171c23169c893a21be1f03bacafad26d7',
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      });

      var kp = KeyPair(nodeHdKey.privateKey.toString('hex'));

      Network.prototype._signMessage.call({
        keyPair: kp
      }, msg, function() {});

      verify({
        signobj: Network.prototype._createSignatureObject(
          msg.params.signature
        ),
        message: {
          id: '12345',
          params: { signature: msg.params.signature }
        },
        nonce: msg.params.nonce,
        contact: contact,
        signature: msg.params.signature,
        address: kp.getAddress()
      }, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('Invalid derived public key');
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
      var StubbedKeyPair = proxyquire('../../lib/crypto-tools/keypair', {
        'bitcore-message': function() {
          return {
            sign: sinon.stub().throws(
              new Error('Point does not lie on the curve')
            )
          };
        }
      });
      Network.prototype._signMessage.call({
        keyPair: StubbedKeyPair()
      }, msg, function(err) {
        expect(err.message).to.equal('Point does not lie on the curve');
        done();
      });
    });

    it('should sign the response message', function(done) {
      var msg = {
        id: 'test',
        result: {}
      };
      Network.prototype._signMessage.call({
        keyPair: KeyPair()
      }, msg, function(err) {
        expect(err).to.equal(undefined);
        expect(typeof msg.result.signature).to.equal('string');
        expect(typeof msg.result.nonce).to.equal('number');
        done();
      });
    });

  });

  describe('#_verifyHDKeyContact', function() {
    var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
        'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
        'ce8af';

    var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
    var hdKey = masterKey.derive('m/3000\'/0\'');
    var key2 = hdKey.deriveChild(12);
    var publicKey = key2.publicKey;

    it('will return true if derived public key matches', function() {
      var verify = Network.prototype._verifyHDKeyContact.bind({
        _hdcache: {}
      });
      var contact = {
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 12
      };
      expect(verify(contact, publicKey)).to.equal(true);
    });

    it('will return false if derived public key does not match', function() {
      var verify = Network.prototype._verifyHDKeyContact.bind({
        _hdcache: {}
      });
      var contact = {
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 10
      };
      expect(verify(contact, publicKey)).to.equal(false);
    });

    it('will return true if contact does nat have hd contact', function() {
      var verify = Network.prototype._verifyHDKeyContact.bind({
        _hdcache: {}
      });
      var contact = {};
      expect(verify(contact, publicKey)).to.equal(true);
    });

  });

  describe('#_createSignatureObject', function() {

    it('should return null for an invalid signature', function() {
      expect(Network.prototype._createSignatureObject(null)).to.equal(null);
    });

  });

  describe('#_handleTransportError', function() {

    it('should send the error to the logger', function() {
      var context = { _logger: { warn: sinon.stub() } };
      Network.prototype._handleTransportError.call(context, new Error('Fail'));
      expect(context._logger.warn.called).to.equal(true);
    });

  });

  describe('#_listenForTunnelers', function() {

    it('should announce unavailable tunnels', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        maxTunnels: 1
      });
      net.transport.tunnelServer._proxies = { foo: 'bar' };
      CLEANUP.push(net);
      net.on('ready', function() {
        var emitter = new EventEmitter();
        var _pub = sinon.stub(net._pubsub, 'publish');
        var _sub = sinon.stub(net._pubsub, 'subscribe');
        net._listenForTunnelers();
        emitter.emit('unlocked');
        setImmediate(function() {
          _pub.restore();
          _sub.restore();
          expect(_pub.args[0][0]).to.equal('0e00');
          done();
        });
      });
    });

    it('should remove the oldest tunneler to add the new one', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        maxTunnels: 0
      });
      CLEANUP.push(net);
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
      net.on('ready', function() {
        var _subscribe = sinon.stub(net._pubsub, 'subscribe', function(t, cb) {
          if (t.indexOf('0e01') !== -1) {
            cb({
              address: '127.0.0.1',
              port: 1337,
              nodeID: utils.rmd160('nodeid'),
              protocol: version.protocol
            }, '0e01');
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
    });

    it('should remove contact when publish received', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        maxTunnels: 0
      });
      CLEANUP.push(net);
      var _removeContact = sinon.stub(net._tunnelers, 'removeContact');
      net.on('ready', function() {
        var _subscribe = sinon.stub(net._pubsub, 'subscribe', function(t, cb) {
          if (t.indexOf('0e00') !== -1) {
            cb({
              address: '127.0.0.1',
              port: 1337,
              nodeID: utils.rmd160('nodeid'),
              protocol: version.protocol
            }, '0e00');
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

  });

  describe('#_setupTunnelClient', function() {

    it('should callback null if transport is public', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        bridgeUri: null
      });
      CLEANUP.push(net);
      net.transport._isPublic = true;
      net._setupTunnelClient(function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should callback error if no seed or bridge provided', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        bridgeUri: null
      });
      CLEANUP.push(net);
      net.transport._isPublic = false;
      net._setupTunnelClient(function(err) {
        expect(err.message).to.equal(
          'Could not find a neighbor to query for probe'
        );
        done();
      });
    });

    it('should use the bridge seed for probe in none provided', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var bridge = sinon.stub(net.bridgeClient, 'getContactList').callsArgWith(
        1,
        null,
        [
          {
            address: '127.0.0.1',
            port: 8080,
            nodeID: utils.rmd160('nodeid')
          }
        ]
      );
      var _probe = sinon.stub(net, '_requestProbe').callsArgWith(1, null, {});
      net.transport._isPublic = false;
      net._setupTunnelClient(function() {
        bridge.restore();
        _probe.restore();
        expect(_probe.called).to.equal(true);
        done();
      });
    });

    it('should use the bridge seed for probe in none provided', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var bridge = sinon.stub(net.bridgeClient, 'getContactList').callsArgWith(
        1,
        new Error('Failed')
      );
      net.transport._isPublic = false;
      net._setupTunnelClient(function(err) {
        bridge.restore();
        expect(err.message).to.equal('Failed to get seeds for probe');
        done();
      });
    });

    it('should try to find a tunnel if probe fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [
          'storj://127.0.0.1:1337/adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        ],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net.transport._isPublic = false;
      var _send = sinon.stub(net.transport, 'send').callsArgWith(
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

  });

  describe('#_requestProbe', function() {

    it('should send a probe message to the contact', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _send = sinon.stub(net.transport, 'send').callsArg(2);
      var contact = { address: '127.0.0.1', port: 1337 };
      net._requestProbe(contact, function() {
        _send.restore();
        expect(_send.args[0][1].method).to.equal('PROBE');
        done();
      });
    });

  });

  describe('#_findTunnel', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('should callback error if no neighbors provided', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net._findTunnel([], function(err) {
        expect(err.message).to.equal(
          'Could not find a neighbor to query for tunnels'
        );
        done();
      });
    });

    it('should return tunnels from neighbors', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var contact = { address: '127.0.0.1', port: 1337 };
      sandbox.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnels: [contact, contact] } }
      );
      sandbox.stub(
        net,
        '_establishTunnel',
        function(tunnels, cb) {
          expect(tunnels).to.have.lengthOf(2);
          cb();
        }
      );
      net._findTunnel([contact, contact], function() {
        done();
      });
    });

    it('should stop trying after success', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(
        net,
        '_establishTunnel',
        function(tunnels, cb) {
          expect(tunnels).to.have.lengthOf(1);
          cb();
        }
      );
      sandbox.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnels: [{nodeID: ''}] } }
      );
      net.transport.send.onFirstCall().callsArgWith(
        2,
        new Error('Failed')
      );
      var contact = { address: '127.0.0.1', port: 1337 };
      net._findTunnel([contact, contact, contact], function(err) {
        if (err) {
          return done(err);
        }
        expect(net.transport.send.callCount).to.equal(2);
        done();
      });

    });

    it('should try all neighbors for tunnel list', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: { tunnels: [] } }
      );
      var contact = { address: '127.0.0.1', port: 1337 };
      net._findTunnel([contact, contact], function(err) {
        expect(net.transport.send.callCount).to.equal(2);
        expect(err.message).to.equal(
          'Failed to find tunnels from neighbors'
        );
        done();
      });
    });

    it('should callback error if send fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net.transport, 'send').callsArgWith(
        2,
        new Error('Not reachable')
      );
      var contact = { address: '127.0.0.1', port: 1337 };
      net._findTunnel([contact], function(err) {
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
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net._establishTunnel([], function(err) {
        expect(err.message).to.equal(
          'Failed to establish tunnel, reason: No tunnelers were returned'
        );
        done();
      });
    });

    it('should callback with error if the tunnel fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _send = sinon.stub(net.transport, 'send').callsArgWith(
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
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _send = sinon.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: {
          proxyPort: 8080,
          contact: { address: '0.0.0.0', port: 1234 }
        } }
      );
      var _addr = sinon.stub(net.transport._server, 'address').returns(null);
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

    it('should recurse with callback if not already called', function(done) {
      var calledOnce = false;
      function Emitter() {}
      Emitter.prototype.open = function() {
        if (calledOnce) {
          return this.emit('open');
        }
        this.emit('error', new Error('Failed'));
      };
      util.inherits(Emitter, EventEmitter);

      var TunClientStubNetwork = proxyquire('../../lib/network', {
        diglet: {
          Tunnel: Emitter
        }
      });
      var net = TunClientStubNetwork({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _send = sinon.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: {
          proxyPort: 8080,
          contact: { address: '0.0.0.0', port: 1234 }
        } }
      );
      var _establishTunnel = sinon.spy(net, '_establishTunnel');
      net._establishTunnel([{
        address: '127.0.0.1',
        port: 1337,
        nodeID: utils.rmd160('nodeid')
      }], function() {
        _send.restore();
        setImmediate(function() {
          expect(_establishTunnel.callCount).to.equal(2);
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
        diglet: {
          Tunnel: function() { return emitter; }
        }
      });
      var net = TunClientStubNetwork({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _send = sinon.stub(net.transport, 'send').callsArgWith(
        2,
        null,
        { result: {
          proxyPort: 8080,
          contact: { address: '0.0.0.0', port: 1234 }
        } }
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
      setImmediate(() => emitter.emit('established'));
    });

  });

  describe('#_enterOverlay', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('should use bridge to get seeds and error if fails', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net, '_setupTunnelClient').callsArg(0);
      sandbox.stub(
        net.bridgeClient,
        'getContactList'
      ).callsArgWith(1, new Error('connection refused'));
      net.join(function(err) {
        expect(err.message).to.equal(
          'Failed to discover seeds from bridge: connection refused'
        );
        done();
      });
    });

    it('should use bridge to get seeds and use them', function(done) {
      this.timeout(12000);
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net, '_setupTunnelClient').callsArg(0);
      sandbox.stub(net, 'connect').callsArgWith(1, null);
      sandbox.stub(
        net.bridgeClient,
        'getContactList'
      ).callsArgWith(1, null, [
        {
          address: '0.0.0.0',
          port: 1234,
          nodeID: utils.rmd160('nodeid'),
          protocol: VERSION.protocol
        }
      ]);
      net.join(done);
    });

    it('should do nothing if no seeds or bridge', function(done) {
      this.timeout(4000);
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net, '_setupTunnelClient').callsArg(0);
      net.on('connected', function() {
        done();
      }).join(function(err) {
        if (err) {
          return done(err);
        }
      });
    });

    it('should stop detecting after success', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [
          'storj://127.0.0.1:1337/' + utils.rmd160('nodeid1'),
          'storj://127.0.0.1:1338/' + utils.rmd160('nodeid2'),
          'storj://127.0.0.1:1339/' + utils.rmd160('nodeid3')
        ],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net, 'connect').callsArgWith(1, null);
      net.connect.onFirstCall().callsArgWith(
        1,
        new Error('Failed')
      );
      sandbox.stub(net, '_setupTunnelClient').callsArg(0);
      net.join(function(err) {
        if (err) {
          return done(err);
        }
        expect(net.connect.callCount).to.equal(2);
        done();
      });
    });

    it('should try all seeds before failing to connect', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [
          'storj://127.0.0.1:1337/' + utils.rmd160('nodeid1'),
          'storj://127.0.0.1:1338/' + utils.rmd160('nodeid2'),
          'storj://127.0.0.1:1339/' + utils.rmd160('nodeid3')
        ],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      sandbox.stub(net, 'connect').callsArgWith(
        1,
        new Error('Failed')
      );
      sandbox.stub(net, '_setupTunnelClient').callsArg(0);
      net.join(function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('Failed to join the network');
        expect(net.connect.callCount).to.equal(3);
        done();
      });
    });

    it('should use the list to connect every 10min', function(done) {
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [
          'storj://127.0.0.1:1337/' + utils.rmd160('nodeid1'),
          'storj://127.0.0.1:1338/' + utils.rmd160('nodeid2'),
          'storj://127.0.0.1:1339/' + utils.rmd160('nodeid3')
        ],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      var _connect = sinon.stub(net, 'connect').callsArgWith(
        1,
        null
      );
      var clock = sinon.useFakeTimers();
      var _setupTunnel = sinon.stub(net, '_setupTunnelClient').callsArg(0);
      net.join(function(err) {
        if (err) {
          return done(err);
        }
        expect(_connect.callCount).to.equal(1);
        clock.tick(600001);
        clock.restore();
        _connect.restore();
        _setupTunnel.restore();
        expect(_connect.callCount).to.equal(2);
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
      var net = Network({
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
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
        keyPair: KeyPair(),
        storageManager: Manager(RAMStorageAdapter()),
        logger: kad.Logger(0),
        seedList: [],
        bridgeUri: null,
        rpcAddress: '127.0.0.1',
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true
      });
      CLEANUP.push(net);
      net.router._buckets[0] = new kad.Bucket();
      net.router._buckets[2] = new kad.Bucket();
      net.router._buckets[0].addContact(Contact({
        address: 'some.public.ip',
        port: 80,
        nodeID: kad.utils.createID('node1'),
        protocol: version.protocol
      }));
      net.router._buckets[2].addContact(Contact({
        address: 'some.public.ip',
        port: 81,
        nodeID: kad.utils.createID('node2'),
        protocol: '0.0.0'
      }));
      net.router._buckets[2].addContact(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: kad.utils.createID('node3'),
        protocol: version.protocol
      }));
      var dropped = net._cleanRoutingTable();
      expect(dropped).to.have.lengthOf(2);
      expect(net.router._buckets[0].getSize()).to.equal(1);
      expect(net.router._buckets[2].getSize()).to.equal(0);
    });

  });

  describe('#_updateActivityCounter', function() {

    it('should reset the timeout and set it again', function(done) {
      var clock = sinon.useFakeTimers();
      var context = {
        _reentranceCountdown: null,
        _enterOverlay: function() {
          clock.restore();
          done();
        }
      };
      Network.prototype._updateActivityCounter.call(context);
      clock.tick(constants.NET_REENTRY);
    });

  });

  after(function(done) {
    _ntp.restore();
    async.eachSeries(CLEANUP, function(net, cb) {
      if (net.transport) {
        net.transport.close();
      }
      cb();
    }, done);
  });

});
