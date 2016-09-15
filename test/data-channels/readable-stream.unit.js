'use strict';

var sinon = require('sinon');
var EventEmitter = require('events').EventEmitter;
var ReadableStream = require('../../lib/data-channels/readable-stream');
var expect = require('chai').expect;

describe('ReadableDataChannelStream', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(
        ReadableStream({ _client: new EventEmitter() })
      ).to.be.instanceOf(ReadableStream);
    });

  });

  describe('#_read', function() {

    it('should send the auth frame if not authenticated', function(done) {
      var channel = new EventEmitter();
      channel._client = new EventEmitter();
      channel._client.send = sinon.stub().callsArg(1);
      channel._client.terminate = sinon.stub();
      var rs = new ReadableStream(channel);
      rs.read();
      setImmediate(function() {
        rs.destroy();
        expect(channel._client.send.called).to.equal(true);
        done();
      });
    });

    it('should do nothing if already authenticated', function(done) {
      var channel = new EventEmitter();
      channel._client = new EventEmitter();
      channel._client.send = sinon.stub().callsArg(1);
      channel._client.terminate = sinon.stub();
      var rs = new ReadableStream(channel);
      rs.isAuthenticated = true;
      rs.read();
      setImmediate(function() {
        rs.destroy();
        expect(channel._client.send.called).to.equal(false);
        done();
      });
    });

    it('should emit error if no data is read by TTFB', function(done) {
      var channel = new EventEmitter();
      channel._client = new EventEmitter();
      channel._client.send = sinon.stub().callsArg(1);
      channel._client.terminate = sinon.stub();
      ReadableStream.MAX_TTFB = 5;
      var rs = new ReadableStream(channel);
      rs.read();
      rs.on('error', function(err) {
        ReadableStream.MAX_TTFB = 5000;
        expect(err.message).to.equal(
          'Did not receive data within max Time-To-First-Byte'
        );
        done();
      });
    });

  });

  describe('#destroy', function() {

    it('should call terminate and set isDestroyed', function() {
      var channel = new EventEmitter();
      channel.readyState = 3;
      channel.terminate = sinon.stub();
      var ws = new ReadableStream({ _client: channel });
      ws.destroy();
      expect(ws._isDestroyed).to.equal(true);
      expect(channel.terminate.called).to.equal(true);
    });

    it('should call return false if already destroyed', function() {
      var channel = new EventEmitter();
      channel.readyState = 3;
      channel.terminate = sinon.stub();
      var rs = new ReadableStream({ _client: channel });
      rs.destroy();
      expect(rs.destroy()).to.equal(false);
    });

  });

});
