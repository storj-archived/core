'use strict';

var expect = require('chai').expect;
var TunnelGateway = require('../../lib/tunnel/gateway');
var ws = require('ws');
var http = require('http');
var kad = require('kad');

describe('TunnelGateway', function() {

  describe('@constructor', function() {

    it('should create an instance with the new keyword', function() {
      expect(new TunnelGateway()).to.be.instanceOf(TunnelGateway);
    });

    it('should create an instance without the new keyword', function() {
      expect(TunnelGateway()).to.be.instanceOf(TunnelGateway);
    });

  });

  describe('#open', function() {

    it('should open the gateway on a random port', function(done) {
      var gw = new TunnelGateway();
      gw.on('open', function(token, alias) {
        expect(token).to.have.lengthOf(64);
        expect(typeof alias.address).to.equal('string');
        expect(typeof alias.port).to.equal('number');
        done();
      });
      gw.open();
    });

    it('should accept a callback if supplied', function(done) {
      var gw = new TunnelGateway();
      gw.open(function(token, alias) {
        expect(token).to.have.lengthOf(64);
        expect(typeof alias.address).to.equal('string');
        expect(typeof alias.port).to.equal('number');
        done();
      });
    });

  });

  describe('#close', function() {

    it('should successfully close down the server', function(done) {
      var gw = new TunnelGateway();
      gw.open(function(token, alias) {
        gw.on('close', function() {
          http.get('http://localhost:' + alias.port).on('error', function(err) {
            expect(err.message).to.equal(
              'connect ECONNREFUSED 127.0.0.1:' + alias.port
            );
            done();
          });
        });
        gw.close();
      });
    });

    it('should accept a callback if supplied', function(done) {
      var gw = new TunnelGateway();
      gw.open(function(token, alias) {
        gw.close(function() {
          http.get('http://localhost:' + alias.port).on('error', function(err) {
            expect(err.message).to.equal(
              'connect ECONNREFUSED 127.0.0.1:' + alias.port
            );
            done();
          });
        });
      });
    });

  });

  describe('#getEntranceToken', function() {

    it('should generate a 32 byte authorization token', function() {
      expect(
        Buffer(TunnelGateway().getEntranceToken(), 'hex')
      ).to.have.lengthOf(32);
    });

  });

  describe('#getEntranceAddress', function() {

    it('should return null if no address is assigned', function() {
      expect(TunnelGateway().getEntranceAddress()).to.equal(null);
    });

    it('should return address if gateway is open', function(done) {
      var gw = new TunnelGateway();
      gw.open(function(token, alias) {
        expect(gw.getEntranceAddress().address).to.equal(alias.address);
        expect(gw.getEntranceAddress().port).to.equal(alias.port);
        done();
      });
    });

  });

  describe('#event:message/rpc', function() {

    it('should emit an event when an RPC is received', function(done) {
      var gateway = new TunnelGateway();
      var message = new kad.Message({ method: 'PING', params: {} });
      gateway.open(function(token, alias) {
        gateway.on('message/rpc', function(rpc) {
          expect(rpc.id).to.equal(message.id);
          done();
        });
        http.request({
          hostname: 'localhost',
          port: alias.port,
          method: 'POST'
        }).end(message.serialize());
      });
    });

  });

  describe('#event:message/datachannel', function() {

    it('should emit an event when an datachannel is opened', function(done) {
      var gateway = new TunnelGateway();
      gateway.open(function(token, alias) {
        gateway.on('message/datachannel', function(data, flags) {
          expect(data.toString()).to.equal('hello world');
          expect(flags.binary).to.equal(true);
          expect(typeof flags.quid).to.equal('string');
          expect(gateway._channels[flags.quid]).to.be.instanceOf(ws);
          done();
        });
        var sock = ws('ws://localhost:' + alias.port);
        sock.on('open', function() {
          sock.send(Buffer('hello world'), { binary: true });
        });
      });
    });

  });

  describe('#respond', function() {

    it('should respond to the appropriate rpc message', function(done) {
      var gateway = new TunnelGateway();
      var message = new kad.Message({ method: 'PING', params: {} });
      gateway.open(function(token, alias) {
        gateway.on('message/rpc', function(rpc) {
          var resp = gateway.respond(kad.Message({
            id: rpc.id,
            result: { text: 'hello gateway friend' }
          }));
          expect(resp).to.equal(true);
        });
        http.request({
          hostname: 'localhost',
          port: alias.port,
          method: 'POST'
        }, function(res) {
          var response = '';
          res.on('data', function(chunk) {
            response += chunk.toString();
          });
          res.on('end', function() {
            response = JSON.parse(response);
            expect(response.id).to.equal(message.id);
            expect(response.result.text).to.equal('hello gateway friend');
            done();
          });
        }).end(message.serialize());
      });
    });

  });

  describe('#transfer', function() {

    it('should send the appropriate data over the channel', function(done) {
      var gateway = new TunnelGateway();
      gateway.open(function(token, alias) {
        gateway.on('message/datachannel', function(data, flags) {
          var xfer = gateway.transfer(
            flags.quid,
            Buffer('hello gateway friend')
          );
          expect(xfer).to.equal(true);
          gateway.terminate(flags.quid);
        });
        var sock = ws('ws://localhost:' + alias.port);
        sock.on('open', function() {
          sock.send(JSON.stringify({
            token: 'token',
            hash: 'hash',
            operation: 'operation'
          }));
        });
        sock.on('message', function(data, flags) {
          expect(flags.binary).to.equal(true);
          expect(data.toString()).to.equal('hello gateway friend');
          done();
        });
      });
    });

  });

});
