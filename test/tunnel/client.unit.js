'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var TunnelClient = require('../../lib/tunnel/client');
var EventEmitter = require('events').EventEmitter;
var proxyquire = require('proxyquire');

describe('TunnelClient', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(TunnelClient('', '')).to.be.instanceOf(TunnelClient);
    });

  });

  describe('#open', function() {

    it('should bubble demuxer error', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client.on('error', function(err) {
        expect(err.message).to.equal('Demuxer error');
        done();
      });
      client.open();
      setImmediate(function() {
        client._demuxer.emit('error', new Error('Demuxer error'));
      });
    });

    it('should emit an error if demuxer give bad frame', function(done) {
      var badDemuxer = new EventEmitter();
      var BadDemuxTunClient = proxyquire('../../lib/tunnel/client', {
        './demultiplexer': function() {
          return badDemuxer;
        },
        ws: EventEmitter
      });
      var client = new BadDemuxTunClient('', '');
      client.on('error', function(err) {
        expect(err.message).to.equal('Cannot handle tunnel frame type');
        done();
      });
      client.open();
      setImmediate(function() {
        client._demuxer.emit('data', { type: 'invalid' });
      });
    });

    it('should bubble muxer error', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client.on('error', function(err) {
        expect(err.message).to.equal('Muxer error');
        done();
      });
      client.open();
      setImmediate(function() {
        client._muxer.emit('error', new Error('Muxer error'));
      });
    });

    it('should bubble tunnel error and close socket', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      var _close = sinon.stub(client, 'close');
      client.on('error', function(err) {
        expect(err.message).to.equal('Tunnel error');
        expect(_close.called).to.equal(true);
        _close.restore();
        done();
      });
      client.open();
      setImmediate(function() {
        emitter.emit('error', new Error('Tunnel error'));
      });
    });

    it('should close if tunnel closes', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      var _close = sinon.stub(client, 'close');
      client.open();
      setImmediate(function() {
        emitter.emit('close');
        expect(_close.called).to.equal(true);
        _close.restore();
        done();
      });
    });

  });

  describe('#close', function() {

    it('should return false if tunnel is not open', function() {
      var client = new TunnelClient('', '');
      expect(client.close()).to.equal(false);
    });

    it('should close the tunnel if it is open', function(done) {
      var emitter = new EventEmitter();
      emitter.readyState = 1;
      emitter.close = sinon.stub();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client.open();
      client.on('close', function() {
        expect(emitter.close.called).to.equal(true);
        done();
      });
      setImmediate(function() {
        expect(client.close()).to.equal(true);
      });
    });

    it('should nullify the tunnel if closed already', function(done) {
      var emitter = new EventEmitter();
      emitter.readyState = 4;
      emitter.close = sinon.stub();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client.open();
      client.on('close', function() {
        expect(emitter.close.called).to.equal(false);
        expect(client._tunnel).to.equal(null);
        done();
      });
      setImmediate(function() {
        client.close();
      });
    });

  });

  describe('#_forwardResponse', function() {

    it('should bubble error if passed', function(done) {
      var client = new TunnelClient('', '');
      client.on('error', function(err) {
        expect(err.message).to.equal('Some error');
        done();
      });
      client._forwardResponse(new Error('Some error'));
    });

  });

  describe('#_handleDataChannel', function() {

    it('should bubble socket error', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client.on('error', function(err) {
        expect(err.message).to.equal('Socket error');
        done();
      });
      client._handleDataChannel({
        flags: { quid: 'test' }
      });
      emitter.emit('error', new Error('Socket error'));
    });

    it('should send to existing socket if exists', function() {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      var _send = sinon.stub(client, '_sendToExistingSocket');
      client._channels.test = {};
      client._handleDataChannel({
        flags: { quid: 'test' }
      });
      _send.restore();
      expect(_send.called).to.equal(true);
    });

    it('should write a term signal to the muxer on close', function(done) {
      var emitter = new EventEmitter();
      var StubbedTunnelClient = proxyquire('../../lib/tunnel/client', {
        ws: function() {
          return emitter;
        }
      });
      var client = new StubbedTunnelClient('', '');
      client._muxer = {
        write: function() {
          done();
        }
      };
      client._handleDataChannel({
        flags: { quid: 'test' }
      });
      setImmediate(function() {
        emitter.emit('close', 1000, 'Consignment completed');
      });
    });

  });

  describe('#_sendToExistingSocket', function() {

    it('should send directly to socket if already open', function() {
      var client = new TunnelClient('', '');
      client._channels.test = new EventEmitter();
      client._channels.test.readyState = 1;
      client._channels.test.send = sinon.stub();
      client._sendToExistingSocket({
        flags: { quid: 'test' }
      });
      expect(client._channels.test.send.called).to.equal(true);
    });

    it('should wait for socket to open before sending data', function(done) {
      var client = new TunnelClient('', '');
      client._channels.test = new EventEmitter();
      client._channels.test.readyState = 0;
      client._channels.test.send = sinon.stub();
      client._sendToExistingSocket({
        flags: { quid: 'test' }
      });
      expect(client._channels.test.send.called).to.equal(false);
      client._channels.test.emit('open');
      setImmediate(function() {
        expect(client._channels.test.send.called).to.equal(true);
        done();
      });
    });

  });

});
