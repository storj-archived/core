'use strict';

/* jshint maxstatements: 100 */

var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var Manager = require('../../lib/storage/manager');
var Logger = require('kad').Logger;
var ShardServer = proxyquire('../../lib/network/shard-server', {
  '../bridge-client': sinon.stub().returns({
    createExchangeReport: sinon.stub()
  })
});
var httpMocks = require('node-mocks-http');
var utils = require('../../lib/utils');
var stream = require('readable-stream');
var {EventEmitter} = require('events');
var StorageItem = require('../../lib/storage/item');

describe('ShardServer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      var server = ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      expect(server).to.be.instanceOf(ShardServer);
    });

  });

  describe('#accept', function() {

    it('should add the token/hash to the accepted list', function() {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', 'filehash');
      expect(server._allowed.token.hash).to.equal('filehash');
    });

  });

  describe('#reject', function() {

    it('should remove the token/hash from the accepted list', function() {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server._allowed.token = {};
      server.reject('token');
      expect(server._allowed.token).to.equal(undefined);
    });

  });

  describe('#_handleEarlySocketClose', function() {

    it('should decrement the active transfers count', function() {
      var ctx = { activeTransfers: 1, _log: new Logger(0) };
      ShardServer.prototype._handleEarlySocketClose.call(ctx);
      expect(ctx.activeTransfers).to.equal(0);
    });

  });

  describe('#_handleRequestError', function() {

    it('should decrement the active transfers count', function() {
      var ctx = { activeTransfers: 1, _log: new Logger(0) };
      ShardServer.prototype._handleRequestError.call(ctx, new Error('Failed'));
      expect(ctx.activeTransfers).to.equal(0);
    });

  });

  describe('#isAuthorized', function() {

    it('should return [false, error] if not authorized', function() {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var [allowed, error] = server.isAuthorized('sometoken');
      expect(allowed).to.equal(false);
      expect(error.message).to.equal('The supplied token is not accepted');
    });

    it('should return [true, null] if authorized', function() {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('sometoken', 'somehash');
      var [allowed, error] = server.isAuthorized('sometoken', 'somehash');
      expect(allowed).to.equal(true);
      expect(error).to.equal(null);
    });

  });

  describe('#routeConsignment', function() {

    it('should send 401 if not authed', function(done) {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/hash',
        params: {
          hash: utils.rmd160('data')
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(401);
        done();
      });
      server.routeConsignment(request, response);
    });

    it('should send 404 if cannot load item', function(done) {
      var manager = Manager(RAMStorageAdapter());
      sinon.stub(manager, 'load').callsArgWith(1, new Error('Failed'));
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/hash',
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(404);
        done();
      });
      server.routeConsignment(request, response);
    });

    it('should send 304 if shard already exists', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var item = StorageItem({
        hash: 'hash',
        contracts: {
          test: {
            data_size: 8
          }
        }
      });
      item.shard = new stream.Readable({ read: () => null });
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/hash',
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(304);
        done();
      });
      server.routeConsignment(request, response);
    });

    it('should send 400 if data size exceeds expected', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var item = StorageItem({
        hash: 'hash',
        contracts: {
          test: {
            data_size: 8
          }
        }
      });
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/' + utils.rmd160sha256('hello'),
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(item.shard.destroy.called).to.equal(true);
        expect(response.statusCode).to.equal(400);
        done();
      });
      server.routeConsignment(request, response);
      request.emit('data', Buffer('longer than 8 bytes'));
    });

    it('should send 400 if integrity check fails', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var item = StorageItem({
        hash: 'hash',
        contracts: {
          test: {
            data_size: 5
          }
        }
      });
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', utils.rmd160sha256('hello'));
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/' + utils.rmd160sha256('hello'),
        params: {
          hash: utils.rmd160sha256('hello')
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(400);
        done();
      });
      server.routeConsignment(request, response);
      request.emit('data', Buffer('olleh'));
      request.emit('end');
    });

    it('should send 200 if success', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var item = StorageItem({
        hash: 'hash',
        contracts: {
          test: {
            data_size: 5
          }
        }
      });
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', utils.rmd160sha256('hello'));
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/shards/' + utils.rmd160sha256('hello'),
        params: {
          hash: utils.rmd160sha256('hello')
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(200);
        done();
      });
      server.routeConsignment(request, response);
      request.emit('data', Buffer('hello'));
      request.emit('end');
    });

  });

  describe('#routeRetrieval', function() {

    it('should send 401 if not authed', function(done) {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var request = httpMocks.createRequest({
        method: 'GET',
        url: '/shards/hash',
        params: {
          hash: utils.rmd160('data')
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(401);
        done();
      });
      server.routeRetrieval(request, response);
    });

    it('should send 404 if cannot load item', function(done) {
      var manager = Manager(RAMStorageAdapter());
      sinon.stub(manager, 'load').callsArgWith(1, new Error('Failed'));
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'GET',
        url: '/shards/hash',
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(404);
        done();
      });
      server.routeRetrieval(request, response);
    });

    it('should handle read failure', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var shard = new stream.Readable({ read: () => null });
      sinon.stub(manager, 'load').callsArgWith(1, null, {
        shard: shard
      });
      var createExchangeReport = sinon.stub();
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160(''),
        bridgeClient: {
          createExchangeReport: createExchangeReport
        }
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'GET',
        url: '/shards/hash',
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(500);
        done();
      });
      server.routeRetrieval(request, response);
      setImmediate(() => {
        shard.emit('error', new Error('Failed to read'));
      });
    });

    it('should handle finish', function(done) {
      var manager = Manager(RAMStorageAdapter());
      var shard = new stream.Readable({ read: () => null });
      sinon.stub(manager, 'load').callsArgWith(1, null, {
        shard: shard
      });
      var createExchangeReport = sinon.stub();
      var server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160(''),
        bridgeClient: {
          createExchangeReport: createExchangeReport
        }
      });
      server.accept('token', 'hash');
      var request = httpMocks.createRequest({
        method: 'GET',
        url: '/shards/hash',
        params: {
          hash: 'hash'
        },
        query: {
          token: 'token'
        }
      });
      var response = httpMocks.createResponse({
        eventEmitter: EventEmitter,
        writableStream: stream.Writable,
        req: request
      });
      response.on('end', function() {
        expect(response.statusCode).to.equal(200);
        expect(createExchangeReport.called).to.equal(true);
        expect(response._getData().toString()).to.equal('hello');
        done();
      });
      server.routeRetrieval(request, response);
      setImmediate(() => {
        shard.push(new Buffer('hello'));
        shard.push(null);
      });
    });

  });

  describe('#_reapDeadTokens', function() {

    it('should reap dead tokens and leave good ones', function() {
      var server = new ShardServer({
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server._allowed = {
        expired: {
          expires: Date.now() - 1000
        },
        notexpired: {
          expires: Date.now() + 1000
        }
      };
      server._reapDeadTokens();
      expect(server._allowed.expired).to.equal(undefined);
      expect(server._allowed.notexpired).to.not.equal(undefined);
    });

  });

});
