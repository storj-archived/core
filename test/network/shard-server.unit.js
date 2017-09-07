'use strict';

const proxyquire = require('proxyquire');
const crypto = require('crypto');
const storj = require('../../');
const expect = require('chai').expect;
const sinon = require('sinon');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const RAMStorageAdapter = require('../../lib/storage/adapters/ram');
const Manager = require('../../lib/storage/manager');
const Logger = require('kad').Logger;
const ShardServer = proxyquire('../../lib/network/shard-server', {
  '../bridge-client': sinon.stub().returns({
    createExchangeReport: sinon.stub()
  })
});
const httpMocks = require('node-mocks-http');
const utils = require('../../lib/utils');
const stream = require('readable-stream');
const {EventEmitter} = require('events');
const StorageItem = require('../../lib/storage/item');

describe('ShardServer', function() {
  let server = null;
  const sandbox = sinon.sandbox.create();
  let tmpPath = '/tmp/storj-shard-server-test-' +
      crypto.randomBytes(4).toString('hex') + '/'

  beforeEach((done) => {
    mkdirp(tmpPath, done);
  });

  afterEach((done) => {
    sandbox.restore();
    server._db.close(() => {
      rimraf(tmpPath, done);
    });
  });


  describe('@constructor', function() {
    it('should create an instance without the new keyword', function() {
      server = ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      expect(server).to.be.instanceOf(ShardServer);
    });
  });

  describe('#accept', function() {
    it('should add the token/hash to the accepted list', function(done) {
      let clock = sandbox.useFakeTimers();
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      let contact = new storj.Contact({
        address: '127.0.0.1',
        port: 4001
      });
      server.accept('token', 'filehash', contact, (err) => {
        if (err) {
          return done(err);
        }
        server._db.get('TK' + 'token', (err, data) => {
          if (err) {
            return done(err);
          }
          let parsed = JSON.parse(data);
          expect(parsed.contact);
          expect(parsed.expires);
          expect(parsed.hash);

          server._db.get('EX' + 2592000000, (err, data) => {
            if (err) {
              return done(err);
            }
            expect(data).to.equal('token');
            done();
          });
        });
      });
    });
  });

  describe('#reject', function() {
    it('should remove the token/hash from the accepted list', function() {
      server = new ShardServer({
        storagePath: tmpPath,
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
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      var [allowed, error] = server.isAuthorized('sometoken');
      expect(allowed).to.equal(false);
      expect(error.message).to.equal('The supplied token is not accepted');
    });

    it('should return [true, null] if authorized', function() {
      server = new ShardServer({
        storagePath: tmpPath,
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
      server = new ShardServer({
        storagePath: tmpPath,
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
      server = new ShardServer({
        storagePath: tmpPath,
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
        test: 'hash',
        contracts: {
          hash: {
            data_size: 8
          },
          renter_hd_key: 'hdkey'
        }
      });
      item.shard = new stream.Readable({ read: () => null });
      let contract = {
        get: sinon.stub().returns('hdkey')
      }
      item.getContract = sinon.stub().returns(contract);
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges = new Map();
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'nodeid'
      };
      server.accept('token', 'hash', contact);
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
      let contract = {
        get: function(key) {
          if (key === 'renter_hd_key') {
            return 'hdkey';
          } else if (key === 'data_size') {
            return 8;
          }

        }
      }
      item.getContract = sinon.stub().returns(contract);
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'nodeid'
      };
      server.accept('token', 'hash', contact);
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
      let contract = {
        get: function(key) {
          if (key === 'renter_hd_key') {
            return 'hdkey';
          } else if (key === 'data_size') {
            return 8;
          }

        }
      }
      item.getContract = sinon.stub().returns(contract);
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'nodeid'
      };
      server.accept('token', utils.rmd160sha256('hello'), contact);
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
      let contract = {
        get: function(key) {
          if (key === 'renter_hd_key') {
            return 'hdkey';
          } else if (key === 'data_size') {
            return 5;
          }

        }
      }
      item.getContract = sinon.stub().returns(contract);
      item.shard = new stream.Writable({ write: () => null });
      item.shard.destroy = sinon.stub();
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      server = new ShardServer({
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'nodeid'
      };
      server.accept('token', utils.rmd160sha256('hello'), contact);
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
      server = new ShardServer({
        storagePath: tmpPath,
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
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      let contact = {
        nodeID: 'nodeid'
      };
      server.accept('token', 'hash', contact);
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
      var item = StorageItem({
        test: 'hash',
        contracts: {
          hash: {
            data_size: 8
          },
          renter_hd_key: 'hdkey'
        }
      });
      item.shard = shard;
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      var createExchangeReport = sinon.stub();
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160(''),
        bridgeClient: {
          createExchangeReport: createExchangeReport
        }
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'hash'
      };
      server.accept('token', 'hash', contact);
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
      var item = StorageItem({
        test: 'hash',
        contracts: {
          hash: {
            data_size: 8
          },
          renter_hd_key: 'hdkey'
        }
      });
      let contract = {
        get: function(key) {
          if (key === 'renter_hd_key') {
            return 'hdkey';
          } else if (key === 'data_size') {
            return 8;
          }

        }
      }
      item.getContract = sinon.stub().returns(contract);
      item.shard = shard;
      sinon.stub(manager, 'load').callsArgWith(1, null, item);
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub()
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        nodeID: 'hash'
      };
      server.accept('token', 'hash', contact);
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
        expect(server.farmerInterface.bridgeRequest.called).to.equal(true);
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
      server = new ShardServer({
        storagePath: tmpPath,
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
