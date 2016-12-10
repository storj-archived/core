'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var Transport = require('../../lib/network/transport');
var Contact = require('../../lib/network/contact');
var KeyPair = require('../../lib/crypto-tools/keypair');
var proxyquire = require('proxyquire');
var kad = require('kad');
var EventEmitter = require('events').EventEmitter;
var utils = require('../../lib/utils');
var StorageManager = require('../../lib/storage/manager');
var RamAdapter = require('../../lib/storage/adapters/ram');

describe('Network/Transport', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), {
        doNotTraverseNat: true,
        storageManager: StorageManager(RamAdapter())
      })).to.be.instanceOf(Transport);
    });

    it('should disable the nagle algorithm on connection', function(done) {
      var transport = new Transport(Contact({
        address: '127.0.0.1',
        port: 0,
        nodeID: KeyPair().getNodeID()
      }), {
        doNotTraverseNat: true,
        storageManager: StorageManager(RamAdapter())
      });
      var sock = { setNoDelay: sinon.stub() };
      transport._server.emit('connection', sock);
      setImmediate(() => {
        expect(sock.setNoDelay.calledWithMatch(true)).to.equal(true);
        done();
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      var emitter = new EventEmitter();
      emitter.end = sinon.stub();
      var _check = sinon.stub().returns(emitter);
      var StubbedTransport = proxyquire('../../lib/network/transport', {
        ip: { isPrivate: sinon.stub().returns(false) },
        net: {
          connect: _check
        }
      });
      StubbedTransport.prototype._checkIfReachable.call({
        _contact: { address: 'public.ip.address' }
      }, function(result) {
        expect(result).to.equal(true);
        done();
      });
      emitter.emit('connect');
    });

    it('it should callback false if not reachable', function(done) {
      var emitter = new EventEmitter();
      emitter.destroy = sinon.stub();
      var _check = sinon.stub().returns(emitter);
      var StubbedTransport = proxyquire('../../lib/network/transport', {
        ip: { isPrivate: sinon.stub().returns(false) },
        net: { connect: _check }
      });
      StubbedTransport.prototype._checkIfReachable.call({
        _contact: { address: 'public.ip.address' }
      }, function(result) {
        expect(result).to.equal(false);
        done();
      });
      emitter.emit('error', new Error());
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
      }), {
        storageManager: StorageManager(RamAdapter())
      });
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
        kad.RPC.prototype,
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
        kad.RPC.prototype,
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

  describe('#_handleRPC', function() {

    it('should respond 400 if cannot parse message', function(done) {
      var response = {
        send: function(code, body) {
          expect(code).to.equal(400);
          expect(body).to.be.instanceOf(Error);
          done();
        }
      };
      Transport.prototype._handleRPC.call({
        receive: sinon.stub()
      }, {
        body: 'invalid body'
      }, response);
    });

    it('should queue the response if the message is request', function(done) {
      var response = {
        status: function(code) {
          expect(code).to.equal(400);
          return { end: done };
        }
      };
      var queued = {};
      Transport.prototype._handleRPC.call({
        receive: sinon.stub(),
        _queuedResponses: queued
      }, {
        body: {
          id: 'test',
          method: 'PING',
          params: {}
        }
      }, response);
      expect(queued.test).to.equal(response);
      done();
    });

    it('should receive the serialized message', function(done) {
      var response = {
        status: function(code) {
          expect(code).to.equal(400);
          return { end: done };
        }
      };
      var queued = {};
      Transport.prototype._handleRPC.call({
        receive: sinon.stub(),
        _queuedResponses: queued
      }, {
        body: {
          id: 'test',
          result: {}
        }
      }, response);
      expect(queued.test).to.equal(undefined);
      done();
    });

  });

  describe('#_routeTunnelProxies', function() {

    it('should not route to proxy if node id is not present', function(done) {
      Transport.prototype._routeTunnelProxies.call({
        tunnelServer: {},
        _contact: { nodeID: 'test' }
      }, {
        header: sinon.stub().returns('test')
      }, {}, done);
    });

    it('should route as websocket if upgrade', function(done) {
      let routews = sinon.stub().callsArg(3);
      Transport.prototype._routeTunnelProxies.call({
        tunnelServer: {
          routeWebSocketConnection: routews
        },
        _contact: { nodeID: 'test' }
      }, {
        header: sinon.stub().returns('someoneelse')
      }, {
        claimUpgrade: sinon.stub().returns({})
      });
      expect(routews.called).to.equal(true);
      done();
    });

    it('should route as http if not upgrade', function(done) {
      let routehttp = sinon.stub().callsArg(3);
      Transport.prototype._routeTunnelProxies.call({
        tunnelServer: {
          routeHttpRequest: routehttp
        },
        _contact: { nodeID: 'test' }
      }, {
        header: sinon.stub().returns('someoneelse')
      }, {});
      expect(routehttp.called).to.equal(true);
      done();
    });

  });

  describe('#_send', function() {

    it('should send to queued response if exists', function(done) {
      var send = sinon.stub();
      var message = '{"id":"test"}';
      Transport.prototype._send.call({
        _queuedResponses: {
          test: { send: send }
        }
      }, message, Contact({
        address: '0.0.0.0',
        port: 1234,
        nodeID: utils.rmd160('')
      }));
      expect(send.called).to.equal(true);
      done();
    });

    it('should receive null if invalid contact', function(done) {
      var message = '{"id":"test","method":"PING","params":{}}';
      var contact = Contact({
        address: '0.0.0.0',
        port: 1234,
        nodeID: utils.rmd160('')
      });
      contact.valid = sinon.stub().returns(false);
      var receive = sinon.stub();
      Transport.prototype._send.call({
        _queuedResponses: {},
        receive: receive
      }, message, contact);
      expect(receive.called).to.equal(true);
      done();
    });

    it('should receive null if request error', function(done) {
      var message = '{"id":"test","method":"PING","params":{}}';
      var receive = sinon.stub();
      var Transport = proxyquire('../../lib/network/transport', {
        restify: {
          createJsonClient: function() {
            return {
              post: sinon.stub().callsArgWith(2, new Error('Failed'))
            };
          }
        }
      });
      Transport.prototype._send.call({
        _queuedResponses: {},
        receive: receive,
        _log: { warn: () => null }
      }, message, Contact({
        address: '0.0.0.0',
        port: 1234,
        nodeID: utils.rmd160('nodeid')
      }));
      expect(receive.calledWithMatch(null)).to.equal(true);
      done();
    });

    it('should receive null if response if invalid', function(done) {
      var message = '{"id":"test","method":"PING","params":{}}';
      var receive = sinon.stub();
      var Transport = proxyquire('../../lib/network/transport', {
        restify: {
          createJsonClient: function() {
            return {
              post: sinon.stub().callsArgWith(
                2,
                null,
                {},
                {},
                'bad data'
              )
            };
          }
        }
      });
      Transport.prototype._send.call({
        _queuedResponses: {},
        receive: receive
      }, message, Contact({
        address: '0.0.0.0',
        port: 1234,
        nodeID: utils.rmd160('nodeid')
      }));
      expect(receive.calledWithMatch(null)).to.equal(true);
      done();
    });

    it('should receive the serialized message', function(done) {
      var message = '{"id":"test","method":"PING","params":{}}';
      var receive = function(data) {
        expect(Buffer.isBuffer(data)).to.equal(true);
        expect(JSON.parse(data.toString()).id).to.equal('test');
        expect(typeof JSON.parse(data.toString()).result).to.equal('object');
        done();
      };
      var Transport = proxyquire('../../lib/network/transport', {
        restify: {
          createJsonClient: function() {
            return {
              post: sinon.stub().callsArgWith(
                2,
                null,
                {},
                {},
                {
                  id: 'test',
                  result: {}
                }
              )
            };
          }
        }
      });
      Transport.prototype._send.call({
        _queuedResponses: {},
        receive: receive
      }, message, Contact({
        address: '0.0.0.0',
        port: 1234,
        nodeID: utils.rmd160('nodeid')
      }));
    });

  });

});
