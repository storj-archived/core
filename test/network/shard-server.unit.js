'use strict';

/* jshint maxstatements: 100 */

var PassThrough = require('readable-stream').PassThrough;
var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var Manager = require('../../lib/storage/manager');
var Logger = require('kad').Logger;
var DataChannelServer = proxyquire('../../lib/network/shard-server', {
  '../bridge-client': sinon.stub().returns({
    createExchangeReport: sinon.stub()
  })
});
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var StorageItem = require('../../lib/storage/item');
var utils = require('../../lib/utils');

describe('DataChannelServer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      })).to.be.instanceOf(DataChannelServer);
    });

  });

  describe('#accept', function() {

    it('should should add the token/hash to the accepted list', function() {
      var dcs = new DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs.accept('token', 'filehash');
      expect(dcs._allowed.token.hash).to.equal('filehash');
    });

  });

  describe('#reject', function() {

    it('should not try to close a client that does not exist', function() {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs._allowed.token = { client: null };
      dcs.reject('token');
      expect(dcs._allowed.token).to.equal(undefined);
    });

    it('should close a client that does exist', function() {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _close = sinon.stub();
      dcs._allowed.token = { client: { readyState: 1, close: _close } };
      dcs.reject('token');
      expect(dcs._allowed.token).to.equal(undefined);
      expect(_close.called).to.equal(true);
    });

  });

  describe('#close', function() {

    it('should close the underlying server', function() {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs._server = { close: sinon.stub() };
      dcs.close();
      expect(dcs._server.close.called).to.equal(true);
    });

  });

  describe('#_handleConnection', function() {

    it('should close the socket on error', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(DataChannelErrors.UNEXPECTED);
        expect(message).to.equal('Socket error');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('error', new Error('Socket error'));
      });
    });

    it('should close the socket if invalid json is sent', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(DataChannelErrors.INVALID_MESSAGE);
        expect(message).to.equal('Failed to parse message');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', 'not json data');
      });
    });

    it('should close the socket if auth fails', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(DataChannelErrors.UNAUTHORIZED_TOKEN);
        expect(message).to.equal('The supplied token is not accepted');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', JSON.stringify({
          token: 'token',
          hash: 'wrong'
        }));
      });
    });

    it('should close the socket if bad operation', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs._allowed.token = {
        client: null,
        hash: 'test',
        expires: Date.now() + 12000
      };
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(DataChannelErrors.INVALID_OPERATION);
        expect(message).to.equal('Failed to handle the defined operation');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', JSON.stringify({
          token: 'token',
          hash: 'test',
          operation: 'INVALID'
        }));
      });
    });

    it('should handle the consign stream', function(done) {
      var msg = JSON.stringify({
        token: 'token',
        hash: 'hash',
        operation: 'PUSH'
      });
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs._allowed.token = {
        client: null,
        hash: 'hash',
        expires: Date.now() + 12000
      };
      var _handleConsignStream = sinon.stub(dcs, '_handleConsignStream');
      var socket = new EventEmitter();
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', msg);
        setImmediate(function() {
          expect(_handleConsignStream.called).to.equal(true);
          done();
        });
      });
    });

    it('should handle the retrieve stream', function(done) {
      var msg = JSON.stringify({
        token: 'token',
        hash: 'hash',
        operation: 'PULL'
      });
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      dcs._allowed.token = {
        client: null,
        hash: 'hash',
        expires: Date.now() + 12000,
        report: { end: sinon.stub() }
      };
      var socket = new EventEmitter();
      var _handleRetrieveStream = sinon.stub(dcs, '_handleRetrieveStream');
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', msg);
        setImmediate(function() {
          expect(_handleRetrieveStream.called).to.equal(true);
          done();
        });
      });
    });

  });

  describe('#_handleError', function() {

    it('should emit an error if the underlying server does', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      }).on('error', function(err) {
        expect(err.message).to.equal('BOOM');
        done();
      });
      dcs._server.emit('error', new Error('BOOM'));
    });

  });

  describe('#_handleRetrieveStream', function() {

    it('should close the socket if manager fails', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        new Error('Failed to load shard data')
      );
      var socket = new EventEmitter();
      socket.close = sinon.stub();
      dcs._allowed.token = {
        hash: 'hash',
        begin: sinon.stub()
      };
      dcs._handleRetrieveStream(socket, 'token');
      setImmediate(function() {
        expect(socket.close.called).to.equal(true);
        _load.restore();
        expect(dcs._allowed.token).to.equal(undefined);
        done();
      });
    });

    it('should not send data if the connection closes', function(done) {
      var shard = new EventEmitter();
      var socket = new EventEmitter();
      socket.readyState = 3;
      shard.pause = sinon.stub();
      shard.removeAllListeners = sinon.stub();
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        null,
        { shard: shard }
      );
      var begin = sinon.stub();
      dcs._allowed.token = {
        hash: 'hash',
        report: {
          begin: begin
        }
      };
      dcs._handleRetrieveStream(socket, 'token');
      setImmediate(function() {
        _load.restore();
        shard.emit('data', new Buffer('ohai'));
        setImmediate(function() {
          expect(begin.callCount).to.equal(1);
          expect(shard.removeAllListeners.called).to.equal(true);
          expect(dcs._allowed.token).to.equal(undefined);
          done();
        });
      });
    });

    it('should send the data and close when finished', function(done) {
      var shard = new EventEmitter();
      var socket = new EventEmitter();
      socket.readyState = 1;
      socket.send = sinon.stub().callsArg(2);
      shard.pause = sinon.stub();
      shard.resume = sinon.stub();
      shard.removeAllListeners = sinon.stub();
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        null,
        { shard: shard }
      );
      var _closeSock = sinon.stub(dcs, '_closeSocketSuccess');
      var report = {
        begin: sinon.stub(),
        end: sinon.stub()
      };
      dcs._allowed.token = {
        hash: 'hash',
        report: report
      };
      dcs._handleRetrieveStream(socket, 'token');
      setImmediate(function() {
        _load.restore();
        shard.emit('data', new Buffer('ohai'));
        setImmediate(function() {
          expect(socket.send.called).to.equal(true);
          shard.emit('end');
          setImmediate(function() {
            expect(report.begin.callCount).to.equal(1);
            expect(report.end.callCount).to.equal(1);
            expect(_closeSock.called).to.equal(true);
            done();
          });
        });
      });
    });

    it('should report read failures', function(done) {
      var shard = new EventEmitter();
      var socket = new EventEmitter();
      socket.readyState = 1;
      socket.send = sinon.stub().callsArg(2);
      shard.pause = sinon.stub();
      shard.resume = sinon.stub();
      shard.removeAllListeners = sinon.stub();
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        null,
        { shard: shard }
      );
      var report = {
        begin: sinon.stub(),
        end: sinon.stub()
      };
      dcs._allowed.token = {
        hash: 'hash',
        report: report
      };
      dcs._handleRetrieveStream(socket, 'token');
      setImmediate(function() {
        _load.restore();
        shard.emit('data', new Buffer('ohai'));
        setImmediate(function() {
          expect(socket.send.called).to.equal(true);
          shard.emit('error');
          setImmediate(function() {
            expect(report.begin.callCount).to.equal(1);
            expect(dcs._allowed.token.report.end.called).to.equal(true);
            done();
          });
        });
      });
    });
  });

  describe('#_handleConsignStream', function() {

    it('should close the socket if manager fails', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        new Error('Failed to load shard data')
      );
      var socket = new EventEmitter();
      socket.close = sinon.stub();
      dcs._allowed.token = {
        hash: 'hash',
        report: { begin: sinon.stub(), end: sinon.stub() }
      };
      dcs._handleConsignStream(socket, 'token');
      setImmediate(function() {
        expect(socket.close.called).to.equal(true);
        _load.restore();
        expect(dcs._allowed.token).to.equal(undefined);
        done();
      });
    });

    it('should reject token and return if socket is closed', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var _load = sinon.stub(manager, 'load').callsArgWith(
        1,
        null,
        StorageItem({
          hash: 'somehash',
          contracts: {
            nodeid2: {
              renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
              data_size: 10,
              data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
              store_begin: Date.now(),
              store_end: Date.now() + 2500,
              audit_count: 2,
              renter_signature: 'signaturegoeshere',
              farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
              farmer_signature: 'signaturegoeshere',
              payment_storage_price: 0,
              payment_download_price: 0,
              payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
            }
          }
        })
      );
      var socket = new EventEmitter();
      socket.close = sinon.stub();
      socket.readyState = 0;
      dcs._allowed.token = {
        hash: 'somehash',
        report: { begin: sinon.stub(), end: sinon.stub() }
      };
      dcs._handleConsignStream(socket, 'token');
      setImmediate(function() {
        _load.restore();
        expect(dcs._allowed.token).to.equal(undefined);
        done();
      });
    });

    it('should close the socket with error if bad hash', function(done) {
      var emitter = new PassThrough();
      var manager = Manager(RAMStorageAdapter());
      var BadHashDataChannelS = proxyquire('../../lib/data-channels/server', {
        'readable-stream': {
          PassThrough: function() {
            return emitter;
          }
        },
        '../bridge-client': sinon.stub().returns({
          createExchangeReport: sinon.stub()
        })
      });
      var dcs = BadHashDataChannelS({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var item = StorageItem({
        hash: 'somehash',
        contracts: {
          nodeid2: {
            renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
            data_size: 10,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2,
            renter_signature: 'signaturegoeshere',
            farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            farmer_signature: 'signaturegoeshere',
            payment_storage_price: 0,
            payment_download_price: 0,
            payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
          }
        }
      });
      item.shard = { write: function() {}, destroy: function() {} };
      var _load = sinon.stub(manager, 'load', function(a ,cb) {
        cb(null, item);
        setImmediate(function() {
          emitter.emit('end');
        });
      });
      var socket = new EventEmitter();
      socket.readyState = 1;
      (function() {
        socket.close = function(code, message) {
          _load.restore();
          expect(code).to.equal(DataChannelErrors.FAILED_INTEGRITY);
          expect(message).to.equal(
            'Calculated hash does not match the expected result'
          );
          done();
        };
        socket.resume = sinon.stub();
      })();
      dcs._allowed.token = {
        hash: 'somehash',
        report: { begin: sinon.stub(), end: sinon.stub() }
      };
      dcs._handleConsignStream(socket, 'token');
    });

    it('should close the socket with success if hash is good', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var data = new Buffer('hello');
      var hash = utils.rmd160sha256(data);
      var item = StorageItem({
        hash: hash,
        contracts: {
          nodeid2: {
            renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
            data_size: data.length,
            data_hash: hash,
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2,
            renter_signature: 'signaturegoeshere',
            farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            farmer_signature: 'signaturegoeshere',
            payment_storage_price: 0,
            payment_download_price: 0,
            payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
          }
        }
      });
      item.shard = {
        end: function() {},
        write: function() {},
        destroy: function() {}
      };
      var _load = sinon.stub(manager, 'load', function(a ,cb) {
        cb(null, item);
      });
      var socket = new EventEmitter();
      socket.readyState = 1;
      (function() {
        socket.close = function(code, message) {
          _load.restore();
          expect(code).to.equal(1000);
          expect(message).to.equal('Consignment completed');
          done();
        };
        socket.resume = sinon.stub();
      })();
      dcs._allowed.token = {
        hash: hash,
        report: { begin: sinon.stub(), end: sinon.stub() }
      };
      dcs._handleConsignStream(socket, 'token');
      setImmediate(function() {
        socket.emit('message', data);
      });
    });

    it('should end the passthrough if received too much data', function(done) {
      var emitter = new PassThrough();
      emitter.end = sinon.stub();
      var manager = Manager(RAMStorageAdapter());
      var PTDataChannelS = proxyquire('../../lib/data-channels/server', {
        'readable-stream': {
          PassThrough: function() {
            return emitter;
          }
        },
        '../bridge-client': sinon.stub().returns({
          createExchangeReport: sinon.stub()
        })
      });
      var dcs = PTDataChannelS({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var item = StorageItem({
        hash: 'somehash',
        contracts: {
          nodeid2: {
            renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
            data_size: 8,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2,
            renter_signature: 'signaturegoeshere',
            farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            farmer_signature: 'signaturegoeshere',
            payment_storage_price: 0,
            payment_download_price: 0,
            payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
          }
        }
      });
      item.shard = { write: function() {}, destroy: function() {} };
      var _load = sinon.stub(manager, 'load', function(a ,cb) {
        cb(null, item);
        setImmediate(function() {
          emitter.emit('end');
        });
      });
      var socket = new EventEmitter();
      (function() {
        socket.readyState = 1;
        socket.resume = sinon.stub();
        socket.close = sinon.stub();
        dcs._allowed.token = {
          hash: 'somehash',
          report: { begin: sinon.stub(), end: sinon.stub() }
        };
        dcs._handleConsignStream(socket, 'token');
        socket.emit('message', Buffer([1,2,3,4]));
        socket.emit('message', Buffer([1,2,3,4,5]));
        setImmediate(function() {
          _load.restore();
          expect(emitter.end.called).to.equal(true);
          done();
        });
      })();
    });

    it('should close socket with success if not writable', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var item = StorageItem({
        hash: 'somehash',
        contracts: {
          nodeid2: {
            renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
            data_size: 10,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2,
            renter_signature: 'signaturegoeshere',
            farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            farmer_signature: 'signaturegoeshere',
            payment_storage_price: 0,
            payment_download_price: 0,
            payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
          }
        }
      });
      item.shard = {};
      var _load = sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var socket = new EventEmitter();
      socket.resume = sinon.stub();
      socket.readyState = 1;
      dcs._allowed.token = {
        hash: 'somehash',
        report: { begin: sinon.stub(), end: sinon.stub() }
      };
      var _closeSocketSuccess = sinon.stub(dcs, '_closeSocketSuccess');
      dcs._handleConsignStream(socket, 'token');
      setImmediate(function() {
        setImmediate(function() {
          _load.restore();
          expect(_closeSocketSuccess.called).to.equal(true);
          _closeSocketSuccess.restore();
          done();
        });
      });
    });

  });

  describe('#_closeSocketSuccess', function() {

    it('should call the socket close method and reject the token', function() {
      var reject = sinon.stub();
      var socket = { close: sinon.stub() };
      DataChannelServer.prototype._closeSocketSuccess.call({
        reject: reject
      }, socket);
      expect(socket.close.called).to.equal(true);
      expect(reject.called).to.equal(true);
    });

  });

});
