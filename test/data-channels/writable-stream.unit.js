'use strict';

var sinon = require('sinon');
var EventEmitter = require('events').EventEmitter;
var WritableStream = require('../../lib/data-channels/writable-stream');
var expect = require('chai').expect;

describe('WritableDataChannelStream', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(
        WritableStream({ _client: new EventEmitter() })
      ).to.be.instanceOf(WritableStream);
    });

    it('should emit finish if channel closes before flush', function(done) {
      var channel = new EventEmitter();
      channel.readyState = 3;
      var ws = new WritableStream({ _client: channel });
      ws.on('finish', done);
      setImmediate(function() {
        channel.emit('close', 1000);
      });
    });

  });

  describe('#destroy', function() {

    it('should call terminate and set isDestroyed', function() {
      var channel = new EventEmitter();
      channel.readyState = 3;
      channel.terminate = sinon.stub();
      var ws = new WritableStream({ _client: channel });
      ws.destroy();
      expect(ws._isDestroyed).to.equal(true);
      expect(channel.terminate.called).to.equal(true);
    });

    it('should call return false if already destroyed', function() {
      var channel = new EventEmitter();
      channel.readyState = 3;
      channel.terminate = sinon.stub();
      var ws = new WritableStream({ _client: channel });
      ws.destroy();
      expect(ws.destroy()).to.equal(false);
    });

  });

  describe('#_handleClosed', function() {

    it('should return default error message if none given', function(done) {
      var channel = new EventEmitter();
      channel.readyState = 3;
      channel.terminate = sinon.stub();
      var ws = new WritableStream({ _client: channel });
      ws._handleClosed(function(err) {
        expect(err.message).to.equal('Unspecified error occurred');
        done();
      }, 0, null);
    });

  });

});
