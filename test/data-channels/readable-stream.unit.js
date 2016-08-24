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
