'use strict';

var http = require('http');
var expect = require('chai').expect;
var TunnelServer = require('../../lib/tunnel/server');
var EventEmitter = require('events').EventEmitter;
var proxyquire = require('proxyquire');
var sinon = require('sinon');

describe('TunnelServer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(TunnelServer({ port: 0 })).to.be.instanceOf(TunnelServer);
    });

    it('should use the http server we give it', function() {
      var server = new http.Server();
      expect(TunnelServer({
        server: server
      })._server._server).to.equal(server);
    });

  });

  describe('#close', function() {

    it('should bubble error if failed to close', function(done) {
      TunnelServer.prototype.close.call({
        _server: {
          close: sinon.stub().callsArgWith(0, new Error('Failed to close'))
        },
        _shutdownGateways: sinon.stub().callsArg(0)
      }, function(err) {
        expect(err.message).to.equal('Failed to close');
        done();
      });
    });

  });

  describe('#_shutdownGateways', function() {

    it('should close each gateway in the tunnel server', function(done) {
      var _gateways = {
        test1: { close: sinon.stub().callsArg(0) },
        test2: { close: sinon.stub().callsArg(0) },
        test3: { close: sinon.stub().callsArg(0) },
      };
      TunnelServer.prototype._shutdownGateways.call({
        _gateways: _gateways
      }, function() {
        expect(_gateways.test1.close.called).to.equal(true);
        expect(_gateways.test2.close.called).to.equal(true);
        expect(_gateways.test3.close.called).to.equal(true);
        done();
      });
    });

  });

  describe('#createGateway', function() {

    it('should refuse to open tunnel if max is reached', function(done) {
      var ts = new TunnelServer({ port: 0, maxTunnels: 0 });
      ts.createGateway(function(err) {
        expect(err.message).to.equal('Maximum number of tunnels open');
        done();
      });
    });

    it('should emit the locked event when max reached', function(done) {
      var ts = new TunnelServer({ port: 0, maxTunnels: 1 });
      var gw = null;
      ts.on('locked', function() {
        ts.on('unlocked', done);
      });
      ts.createGateway(function(err, result) {
        gw = result;
        setTimeout(function() {
          gw.close();
        }, 200);
      });
    });

    it('should only open within the specified port range', function(done) {
      var ts = new TunnelServer({
        port: 0,
        maxTunnels: 3,
        portRange: { min: 55000, max: 55002 }
      });
      var options = [55000, 55001, 55002];
      ts.createGateway(function(err, gw1) {
        expect(err).to.equal(null);
        options.splice(options.indexOf(gw1.getEntranceAddress().port), 1);
        ts.createGateway(function(err, gw2) {
          expect(err).to.equal(null);
          options.splice(options.indexOf(gw2.getEntranceAddress().port), 1);
          ts.createGateway(function(err, gw3) {
            expect(err).to.equal(null);
            options.splice(options.indexOf(gw3.getEntranceAddress().port), 1);
            expect(options).to.have.lengthOf(0);
            ts.createGateway(function(err) {
              expect(err).to.not.equal(null);
              done();
            });
          });
        });
      });
    });

  });

  describe('#_verifyClient', function() {

    it('should return false and 401 for unauthorized token', function(done) {
      var ts = new TunnelServer({ port: 0 });
      ts._verifyClient({
        req: {
          url: 'ws://127.0.0.1:1337/tun?token=sometoken'
        }
      }, function(result, code) {
        expect(result).to.equal(false);
        expect(code).to.equal(401);
        done();
      });
    });

  });

  describe('#_handleClient', function() {

    it('should close connection to unauthorized client', function(done) {
      var ts = new TunnelServer({ port: 0 });
      ts._handleClient({
        upgradeReq: { url: 'ws://127.0.0.1:1337/tun?token=sometoken' },
        close: function(code, result) {
          expect(code).to.equal(404);
          expect(result.error).to.equal('Gateway no longer open');
          done();
        }
      });
    });

    it('should glose the gateway if client disconnects', function(done) {
      var ts = new TunnelServer({ port: 0 });
      var client = new EventEmitter();
      ts.createGateway(function(err, gateway) {
        client.upgradeReq = {
          url: 'ws://127.0.0.1:' + gateway.getEntranceAddress().port +
               '/tun?token=' + gateway.getEntranceToken()
        };
        ts._handleClient(client);
        client.emit('close');
        setImmediate(function() {
          expect(Object.keys(ts._gateways)).to.have.lengthOf(0);
          expect(ts._usedPorts).to.have.lengthOf(0);
          done();
        });
      });
    });

    it('should close the client if muxer error', function(done) {
      var badMuxer = new EventEmitter();
      badMuxer.source = sinon.stub();
      var BadMuxTunServer = proxyquire('../../lib/tunnel/server', {
        './multiplexer': function() {
          return badMuxer;
        }
      });
      var client = new EventEmitter();
      client.upgradeReq = { url: 'ws://127.0.0.1:1337/tun?token=sometoken' };
      client.close = function(code, result) {
        expect(code).to.equal(400);
        expect(result.error).to.equal('Muxer error');
        done();
      };
      var ts = new BadMuxTunServer({ server: http.Server() });
      ts._gateways.sometoken = new EventEmitter();
      ts._handleClient(client);
      badMuxer.emit('error', new Error('Muxer error'));
    });

    it('should close the client if demuxer error', function(done) {
      var badDemuxer = new EventEmitter();
      var BadDemuxTunServer = proxyquire('../../lib/tunnel/server', {
        './demultiplexer': function() {
          return badDemuxer;
        }
      });
      var client = new EventEmitter();
      client.upgradeReq = { url: 'ws://127.0.0.1:1337/tun?token=sometoken' };
      client.close = function(code, result) {
        expect(code).to.equal(400);
        expect(result.error).to.equal('Demuxer error');
        done();
      };
      var ts = new BadDemuxTunServer({ server: http.Server() });
      ts._gateways.sometoken = new EventEmitter();
      ts._handleClient(client);
      badDemuxer.emit('error', new Error('Demuxer error'));
    });

    it('should close the client if unhandled demux type', function(done) {
      var badDemuxer = new EventEmitter();
      var BadDemuxTunServer = proxyquire('../../lib/tunnel/server', {
        './demultiplexer': function() {
          return badDemuxer;
        }
      });
      var client = new EventEmitter();
      client.upgradeReq = { url: 'ws://127.0.0.1:1337/tun?token=sometoken' };
      client.close = function(code, result) {
        expect(code).to.equal(400);
        expect(result.error).to.equal('Cannot handle tunnel frame type');
        done();
      };
      var ts = new BadDemuxTunServer({ server: http.Server() });
      ts._gateways.sometoken = new EventEmitter();
      ts._handleClient(client);
      badDemuxer.emit('data', { type: 'invalid' });
    });

    it('should cleanup on muxer data if the client is closed', function(done) {
      var muxer = new EventEmitter();
      muxer.source = sinon.stub();
      var client = new EventEmitter();
      client.upgradeReq = { url: 'ws://127.0.0.1:1337/tun?token=sometoken' };
      client.readyState = 0;
      var MuxerStubTunServer = proxyquire('../../lib/tunnel/server', {
        './multiplexer': function() {
          return muxer;
        }
      });
      var ts = new MuxerStubTunServer({ server: http.Server() });
      ts._gateways.sometoken = new EventEmitter();
      ts._gateways.sometoken.close = sinon.stub();
      ts._handleClient(client);
      setImmediate(function() {
        muxer.emit('data', {});
        setImmediate(function() {
          expect(ts._gateways.sometoken.close.called).to.equal(true);
          done();
        });
      });
    });

  });

  describe('#_getAvailablePort', function() {

    it('should not remove an incorrect available port', function() {
      var ts = new TunnelServer({
        server: http.Server(),
        portRange: { min: 5000, max: 5000 }
      });
      ts._usedPorts.push(5001);
      expect(ts._getAvailablePort()).to.equal(5000);
    });

  });

});
