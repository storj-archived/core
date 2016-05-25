'use strict';

var expect = require('chai').expect;
var proxyquire = require('proxyquire').noPreserveCache();
var DataChannelClient = proxyquire('../../lib/datachannel/client', {
  ws: require('events').EventEmitter
});
var sinon = require('sinon');

describe('DataChannelClient', function() {

  describe('#createReadStream', function() {

    it('should emit an error for bad json', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc._client.send = sinon.stub();
      dc._client.close = sinon.stub();
      var rs = dc.createReadStream();
      rs.once('error', function(err) {
        expect(err.message).to.equal('Unexpected token ~');
        done();
      });
      setImmediate(function() {
        dc._client.emit('message', '~');
      });
    });

    it('should emit an error for channel error', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc._client.send = sinon.stub();
      dc._client.close = sinon.stub();
      var rs = dc.createReadStream();
      rs.once('error', function(err) {
        expect(err.message).to.equal('FAIL');
        done();
      });
      setImmediate(function() {
        dc._client.emit('message', JSON.stringify({
          code: 500,
          message: 'FAIL'
        }));
      });
    });

    it('should pass along all the chunks', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc._client.send = sinon.stub();
      dc._client.close = function() {
        dc._client.emit('close');
      };
      var rs = dc.createReadStream();
      var result = '';
      rs.on('end', function() {
        expect(result).to.equal('hello data channel');
        done();
      });
      rs.on('data', function(data) {
        result += data.toString();
      });
      setImmediate(function() {
        dc._client.emit('message', Buffer('hello '));
        dc._client.emit('message', Buffer('data'));
        dc._client.emit('message', Buffer(' channel'));
        dc._client.emit('message', JSON.stringify({
          code: 200
        }));
      });
    });

  });

  describe('#createWriteStream', function() {

    it('should emit an error for bad json', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc._client.send = sinon.stub();
      dc._client.close = sinon.stub();
      var ws = dc.createWriteStream();
      ws.once('error', function(err) {
        expect(err.message).to.equal('Unexpected token ~');
        done();
      });
      setImmediate(function() {
        dc._client.emit('message', '~');
      });
    });

    it('should call send 1 for auth, 2 for data', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      var _send = sinon.stub(dc._client, 'send', function(data, flags, cb) {
        if (typeof flags === 'function') {
          flags();
        } else if (typeof cb === 'function') {
          cb();
        }
      });
      dc._client.close = sinon.stub();
      var ws = dc.createWriteStream();
      ws.once('finish', function() {
        _send.restore();
        expect(_send.callCount).to.equal(3);
        done();
      });
      setImmediate(function() {
        ws.write(Buffer('hello'));
        ws.write(Buffer('storj'));
        ws.end();
      });
    });

    it('should emit an error for channel error', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      sinon.stub(dc._client, 'send', function(data, cb) {
        if (cb) {
          cb();
        }
      });
      dc._client.close = sinon.stub();
      var ws = dc.createWriteStream();
      ws.once('error', function(err) {
        expect(err.message).to.equal('FAIL');
        done();
      });
      setImmediate(function() {
        dc._client.emit('message', JSON.stringify({
          code: 500,
          message: 'FAIL'
        }));
      });
    });

  });

  describe('#_handleChannelError', function() {

    it('should emit an error event', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc.once('error', function(err) {
        expect(err.message).to.equal('FAIL');
        done();
      });
      dc._handleChannelError(new Error('FAIL'));
    });

  });

});
