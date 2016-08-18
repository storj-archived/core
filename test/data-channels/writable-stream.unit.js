'use strict';

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

});
