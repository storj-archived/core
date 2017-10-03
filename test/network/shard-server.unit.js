'use strict';

const async = require('async');
const proxyquire = require('proxyquire');
const crypto = require('crypto');
const storj = require('../../');
const expect = require('chai').expect;
const sinon = require('sinon');
const HDKey = require('hdkey');
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

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
    'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
    'ce8af';

var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
var hdKey = masterKey.derive('m/3000\'/0\'');

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
    server.close(() => {
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
      clock.tick(0);
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

          let key = server._encodeExpiresKey(ShardServer.TOKEN_EXPIRE);
          server._db.get(key, (err, data) => {
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
    it('should remove the token/hash from the accepted list', function(done) {
      let clock = sandbox.useFakeTimers();
      clock.tick(0);
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
      server.accept('token2', 'filehash2', contact, (err) => {
        if (err) {
          return done(err);
        }
        server.reject('token2', (err) => {
          if (err) {
            return done(err);
          }
          server._db.get('TK' + 'token2', (err) => {
            expect(err.notFound).to.equal(true);
            server._db.get(server._encodeExpiresKey(2592000000), (err) => {
              expect(err.notFound).to.equal(true);
              done();
            });
          });
        });
      });
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
    it('should return error if not authorized (no token)', function(done) {
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.isAuthorized(null, null, (err) => {
        expect(err.message).to.equal('You did not supply a token');
        done();
      });
    });
    it('should give error if not authorized (no hash)', function(done) {
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.isAuthorized('token', null, (err) => {
        expect(err.message).to.equal('You did not supply the data hash');
        done();
      });
    });
    it('should give error if not authorized (not found)', function(done) {
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.isAuthorized('token10', 'hash', (err) => {
        expect(err.message).to.equal('The supplied token is not accepted');
        done();
      });
    });
    it('should give error if not authorized (wrong hash)', function(done) {
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
      server.accept('sometoken3', 'somehash3', contact, (err) => {
        if (err) {
          return done(err);
        }
        server.isAuthorized('sometoken3', 'somehash4', (err) => {
          expect(err.message).to.equal('Token not valid for hash');
          done();
        });
      });
    });
    it('should not give error and give contact if authorized', function(done) {
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
      server.accept('sometoken2', 'somehash2', contact, (err) => {
        if (err) {
          return done(err);
        }
        server.isAuthorized('sometoken2', 'somehash2', (err, contact) => {
          expect(err).to.equal(null);
          expect(contact).to.be.instanceOf(storj.Contact);
          expect(contact.address).to.equal('127.0.0.1');
          expect(contact.port).to.equal(4001);
          done();
        });
      });
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
      server.isAuthorized = sinon.stub().callsArgWith(2, new Error('test'));
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
      let contact = {
        address: '127.0.0.1',
        port: 4001,
        nodeID: utils.rmd160('')
      };
      server.accept('token', 'hash', contact, (err) => {
        if (err) {
          return done(err);
        }
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
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges = new Map();
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        address: '127.0.0.1',
        port: 3001,
        nodeID: utils.rmd160('')
      };
      server.accept('token', 'hash', contact, (err) => {
        if (err) {
          return done(err);
        }
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
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        address: '127.0.0.1',
        port: 3001,
        nodeID: utils.rmd160('')
      };
      let token = '2083494abc01';
      let hash = utils.rmd160sha256('hello')
      server.accept(token, hash, contact, (err) => {
        if (err) {
          return done(err);
        }
        var request = httpMocks.createRequest({
          method: 'POST',
          url: '/shards/' + hash,
          params: {
            hash: hash
          },
          query: {
            token: token
          }
        });
        var response = httpMocks.createResponse({
          eventEmitter: EventEmitter,
          writableStream: stream.Writable,
          req: request
        });
        response.on('end', function() {
          expect(response.statusCode).to.equal(400);
          expect(item.shard.destroy.called).to.equal(true);
          done();
        });
        server.routeConsignment(request, response);
        setTimeout(() => {
          request.emit('data', Buffer('longer than 8 bytes'));
        }, 100);
      });
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
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        address: '127.0.0.1',
        port: 4001,
        nodeID: utils.rmd160('')
      };
      let token = '938af7147aea';
      let hash = utils.rmd160sha256('hello');
      server.accept(token, hash, contact, (err) => {
        if (err) {
          return done(err);
        }
        var request = httpMocks.createRequest({
          method: 'POST',
          url: '/shards/' + hash,
          params: {
            hash: hash
          },
          query: {
            token: token
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
        setTimeout(() => {
          request.emit('data', Buffer('olleh'));
          request.emit('end');
        }, 300);
      });
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
        storagePath: tmpPath,
        storageManager: manager,
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      server.farmerInterface = {
        bridges: new Map(),
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        address: '127.0.0.1',
        port: 4001,
        nodeID: utils.rmd160('')
      };
      let token = '15b6e35ded84';
      let hash = utils.rmd160sha256('hello');
      server.accept(token, hash, contact, () => {
        var request = httpMocks.createRequest({
          method: 'POST',
          url: '/shards/' + hash,
          params: {
            hash: hash
          },
          query: {
            token: token
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
        setTimeout(() => {
          request.emit('data', Buffer('hello'));
          request.emit('end');
        }, 300);
      });
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
        address: '127.0.0.1',
        port: 4001,
        nodeID: utils.rmd160('')
      };
      server.accept('token', 'hash', contact, () => {
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
    });
    it('should handle read failure', function(done) {
      const manager = Manager(RAMStorageAdapter());
      const shard = new stream.Readable({ read: () => null });
      let itemData = {
        test: 'hash',
        contracts: {
          hash: {
            data_size: 8,
            renter_hd_key: hdKey.publicExtendedKey
          }
        }
      };
      const item = StorageItem(itemData);
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
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges.set(hdKey.publicExtendedKey, {});
      let contact = {
        address: '127.0.0.1',
        port: 4001,
        hdKey: hdKey.publicExtendedKey,
        hdIndex: 1
      };
      server.accept('token', 'hash', contact, (err) => {
        if (err) {
          return done(err);
        }
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
          let data = response._getData();
          expect(data.result).to.equal('Failed to read');
          done();
        });
        server.routeRetrieval(request, response);
        setTimeout(() => {
          shard.emit('error', new Error('Failed to read'));
        }, 100);
      });
    });
    it('should handle finish', function(done) {
      const manager = Manager(RAMStorageAdapter());
      const shard = new stream.Readable({ read: () => null });
      const item = StorageItem({
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
        bridgeRequest: sinon.stub(),
        _options: {
          storagePath: '/tmp'
        }
      }
      server.farmerInterface.bridges.set('hdkey', {});
      let contact = {
        address: '127.0.0.1',
        port: 4001,
        nodeID: utils.rmd160('')
      };
      server.accept('token', 'hash', contact, (err) => {
        if (err) {
          return done(err);
        }
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
        setTimeout(() => {
          shard.push(new Buffer('hello'));
          shard.push(null);
        }, 200);
      });
    });
  });

  describe('#_reapDeadTokens', function() {
    this.timeout(0);
    it('should reap dead tokens and leave good ones', function(done) {
      let clock = sandbox.useFakeTimers();
      server = new ShardServer({
        storagePath: tmpPath,
        storageManager: Manager(RAMStorageAdapter()),
        logger: Logger(0),
        nodeID: utils.rmd160('')
      });
      clearInterval(server._reapDeadTokensInterval);
      let contact = {
        address: '127.0.0.1',
        port: 4001
      };
      let time = ShardServer.TOKEN_EXPIRE / 12;
      async.timesSeries(25, (n, next) => {
        server.accept('token' + n, 'hash' + n, contact, (err) => {
          if (err) {
            return next(err);
          }
          clock.tick(time);
          next();
        });
      }, (err) => {
        if (err) {
          return done(err);
        }
        server._reapDeadTokens();
        server.on('reapedTokens', (total) => {
          expect(total).to.equal(14);
          server._db.get('TK' + 'token1', (err) => {
            expect(err.notFound).to.equal(true);
            done();
          });
        });
      });
    });
  });
});
