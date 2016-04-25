'use strict';

var expect = require('chai').expect;
var TunnelServer = require('../../lib/tunnel/server');

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

  });

});
