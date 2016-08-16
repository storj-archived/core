'use strict';

var expect = require('chai').expect;
var proxyquire = require('proxyquire').noPreserveCache();
var DataChannelClient = proxyquire('../../lib/data-channels/client', {
  ws: require('events').EventEmitter
});
var sinon = require('sinon');
var DataChannelPointer = require('../../lib/data-channels/pointer');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');

describe('DataChannelClient', function() {

  describe('#createReadStream', function() {

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
        dc._client.emit('close', 500, 'FAIL');
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
        dc._client.emit('close', 1000);
      });
    });

  });

  describe('#createWriteStream', function() {

    it('should call send 1 for auth, 2 for data', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      var _send = sinon.stub(dc._client, 'send', function(data, flags, cb) {
        if (typeof flags === 'function') {
          flags();
        } else if (typeof cb === 'function') {
          cb();
        }
      });
      dc._client.readyState = 1;
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
        dc._client.emit('close', 500, 'FAIL');
      });
    });

    it('should emit an error if socket closes during xfer', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      sinon.stub(dc._client, 'send', function(data, cb) {
        if (cb) {
          cb();
        }
      });
      dc._client.readyState = 3;
      var ws = dc.createWriteStream();
      dc.once('error', function(err) {
        expect(err.message).to.equal('Remote host terminated early');
        done();
      });
      setImmediate(function() {
        ws.write(Buffer('hay gurl hay'));
      });
    });

    it('should wait for socket to close before flushing', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      sinon.stub(dc._client, 'send', function(data, flags, cb) {
        if (typeof flags === 'function') {
          cb = flags;
        }
        cb();
      });
      dc._client.readyState = 1;
      var ws = dc.createWriteStream();
      ws.on('finish', done);
      setImmediate(function() {
        ws.write(Buffer('hay gurl hay'));
        ws.end();
        setImmediate(function() {
          dc._client.emit('close');
        });
      });
    });

    it('should flush if the socket is already closed', function(done) {
      var dc = new DataChannelClient({ address: '', port: 0 });
      dc._client.readyState = 1;
      sinon.stub(dc._client, 'send', function(data, flags, cb) {
        if (typeof flags === 'function') {
          cb = flags;
        }
        cb();
        dc._client.readyState = 3;
      });
      var ws = dc.createWriteStream();
      ws.on('finish', done);
      setImmediate(function() {
        ws.write(Buffer('hay gurl hay'));
        ws.end();
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

describe('DataChannelClient#getChannelURL', function() {

  it('should create url and trim whitespace from address', function() {
    expect(DataChannelClient.getChannelURL({
      address: ' 127.0.0.1  ',
      port: 1337
    })).to.equal('ws://127.0.0.1:1337');
  });

});

describe('DataChannelClient#getStreamFromPointer', function() {

  it('should return a readable stream for PULL pointer', function(done) {
    var pointer = new DataChannelPointer(
      Contact({ address: '127.0.0.1', port: 1337, nodeID: utils.rmd160('') }),
      utils.rmd160('hash'),
      utils.generateToken(),
      'PULL'
    );
    var dcx = DataChannelClient.getStreamFromPointer(pointer, function(err, s) {
      expect(typeof s.read).to.equal('function');
      done();
    });
    setImmediate(function() {
      dcx.emit('open');
    });
  });

  it('should return a writable stream for PUSH pointer', function(done) {
    var pointer = new DataChannelPointer(
      Contact({ address: '127.0.0.1', port: 1337, nodeID: utils.rmd160('') }),
      utils.rmd160('hash'),
      utils.generateToken(),
      'PUSH'
    );
    var dcx = DataChannelClient.getStreamFromPointer(pointer, function(err, s) {
      expect(typeof s.write).to.equal('function');
      done();
    });
    setImmediate(function() {
      dcx.emit('open');
    });
  });

});
