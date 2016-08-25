'use strict';

var expect = require('chai').expect;
var TunnelGateway = require('../../lib/tunnel/gateway');
var ws = require('ws');
var http = require('http');
var https = require('https');
var kad = require('kad');
var pem = require('pem');
var sinon = require('sinon');
var events = require('events');

describe('TunnelGateway', function() {

  describe('@constructor', function() {

    it('should create an instance with the new keyword', function() {
      expect(new TunnelGateway()).to.be.instanceOf(TunnelGateway);
    });

    it('should create an instance without the new keyword', function() {
      expect(TunnelGateway()).to.be.instanceOf(TunnelGateway);
    });

    it('should create a gateway with ssl if opts suopplied', function(done) {
      pem.createCertificate({ days: 1, selfSigned: true }, function(err, keys) {
        var gw = TunnelGateway({
          key: keys.serviceKey,
          cert: keys.certificate
        });
        expect(gw._server).to.be.instanceOf(https.Server);
        done();
      });
    });

  });

  describe('#respond', function() {

    it('should return false if no pending request', function() {
      expect(TunnelGateway().respond({
        id: 'test',
        method: 'PING',
        params: {}
      })).to.equal(false);
    });

    it('should return false if it fails to send response', function() {
      var gw = new TunnelGateway();
      gw._responses.test = {/* not a valid res object */};
      expect(gw.respond({
        id: 'test',
        method: 'PING',
        params: {}
      })).to.equal(false);
    });

  });

  describe('#transfer', function() {

    it('should return false if no pending channel', function() {
      expect(TunnelGateway().transfer('test', 'data')).to.equal(false);
    });

    it('should return false if it fails to send channel', function() {
      var gw = new TunnelGateway();
      gw._channels.test = {/* not a valid sock object */};
      expect(gw.transfer('test', 'data')).to.equal(false);
    });

  });

  describe('#terminate', function() {

    it('should return false if no channel by quid', function() {
      expect(TunnelGateway().terminate('test')).to.equal(false);
    });

    it('should return false if it fails to close channel', function() {
      var gw = new TunnelGateway();
      gw._channels.test = {/* not a valid sock object */};
      expect(gw.terminate('test')).to.equal(false);
    });

  });

  describe('#_shutdown', function() {

    it('should end and close responses and channels', function(done) {
      var gw = new TunnelGateway();
      gw._responses = { test: { end: sinon.stub() } };
      gw._channels = { test: { close: sinon.stub() } };
      gw.on('open', function() {
        gw._shutdown();
        expect(gw._responses.test.end.called).to.equal(true);
        expect(gw._channels.test.close.called).to.equal(true);
        done();
      });
      gw.open();
    });

  });

  describe('#_handleRPC', function() {

    it('should respond with a 400 if an invalid RPC', function(done) {
      var gw = TunnelGateway();
      var req = new events.EventEmitter();
      var res = {
        writeHead: function(code) {
          expect(code).to.equal(400);
        },
        end: done
      };
      gw._handleRPC(req, res);
      req.emit('data', Buffer('BAD RPC'));
      req.emit('end');
    });

    it('should log an error from the incoming message', function(done) {
      var gw = TunnelGateway();
      gw._logger.error = sinon.stub();
      var req = new events.EventEmitter();
      var res = {
        writeHead: function(code) {
          expect(code).to.equal(400);
        },
        end: done
      };
      gw._handleRPC(req, res);
      setImmediate(function() {
        req.emit('error', new Error('socket hang up'));
        expect(gw._logger.error.called).to.equal(true);
        done();
      });
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
      after(gw.close.bind(gw));
    });

    it('should open the gateway on the given port', function(done) {
      var gw = new TunnelGateway({}, 50000);
      gw.on('open', function(token, alias) {
        expect(alias.port).to.equal(50000);
        done();
      });
      gw.open();
      after(gw.close.bind(gw));
    });

    it('should accept a callback if supplied', function(done) {
      var gw = new TunnelGateway();
      gw.open(function(token, alias) {
        expect(token).to.have.lengthOf(64);
        expect(typeof alias.address).to.equal('string');
        expect(typeof alias.port).to.equal('number');
        done();
      });
      after(gw.close.bind(gw));
    });

    it('should emit an error if no callback is supplied', function(done) {
      var gw = new TunnelGateway();
      var _listen = sinon.stub(gw._server, 'listen', function() {
        gw._server.emit('error', new Error('EADDRINUSE'));
      });
      gw.on('error', function(err) {
        _listen.restore();
        expect(err.message).to.equal('Failed to open tunnel gateway');
        done();
      });
      gw.open();
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
      after(gw.close.bind(gw));
    });

  });

});

describe('TunnelGateway/events', function() {

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
      after(gateway.close.bind(gateway));
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
      after(gateway.close.bind(gateway));
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
      after(gateway.close.bind(gateway));
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
      after(gateway.close.bind(gateway));
    });

  });

});
