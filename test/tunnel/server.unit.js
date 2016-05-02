'use strict';

var expect = require('chai').expect;
var TunnelServer = require('../../lib/tunnel/server');
var EventEmitter = require('events').EventEmitter;

describe('TunnelServer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(TunnelServer({ port: 0 })).to.be.instanceOf(TunnelServer);
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
        options.splice(options.indexOf(gw1.getEntranceAddress().port), 1);
        ts.createGateway(function(err, gw2) {
          options.splice(options.indexOf(gw2.getEntranceAddress().port), 1);
          ts.createGateway(function(err, gw3) {
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

  });

});
