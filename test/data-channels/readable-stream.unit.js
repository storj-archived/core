'use strict';

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

});
