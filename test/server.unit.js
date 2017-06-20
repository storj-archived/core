'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const createMocks = require('./fixtures/http-mocks');
const stream = require('stream');
const levelup = require('levelup');
const memdown = require('memdown');
const { randomBytes } = require('crypto');
const constants = require('../lib/constants');
const utils = require('../lib/utils');
const Server = require('../lib/server');


describe('@class Server', function() {

  describe('@constructor', function() {

    const sandbox = sinon.sandbox.create();

    after(() => sandbox.restore());

    it('should reap expired tokens on interval', function() {
      const clock = sandbox.useFakeTimers('setInterval');
      const server = new Server();
      const reapExpiredTokens = sandbox.stub(server, '_reapExpiredTokens');
      clock.tick(constants.TOKEN_EXPIRE * 2);
      expect(reapExpiredTokens.callCount).to.equal(2);
    });

  });

  describe('@method accept', function() {

    it('should throw if invalid params', function() {
      const server = new Server();
      expect(() => {
        server.accept(1, 'filehash', ['identity', {}]);
      }).to.throw(Error, 'Invalid token supplied');
      expect(() => {
        server.accept('token', 1, ['identity', {}]);
      }).to.throw(Error, 'Invalid filehash supplied');
    });

    it('should create an entry in the allowed map', function() {
      const server = new Server();
      server.accept('token', 'filehash', ['identity', {}]);
      let entry = server._allowed.get('token');
      expect(entry.hash).to.equal('filehash');
      expect(entry.contact[0]).to.equal('identity');
      expect(typeof entry.expires).to.equal('number');
    });

  });

  describe('@method reject', function() {

    it('should throw if invalid params', function() {
      const server = new Server();
      expect(() => {
        server.reject(1);
      }).to.throw(Error, 'Invalid token supplied');
    });

    it('should delete the entry in allowed map', function() {
      const server = new Server();
      server._allowed.set('foo', 'bar');
      server.reject('foo');
      expect(server._allowed.has('foo')).to.equal(false);
    });

  });

  describe('@method isAuthorized', function() {

    const sandbox = sinon.sandbox.create();

    after(() => sandbox.restore());

    it('should throw if not authorized', function() {
      const clock = sandbox.useFakeTimers();
      const server = new Server();
      server.accept('valid', 'hash');
      expect(() => {
        server.authorize(null);
      }).to.throw(Error, 'You did not supply a token');
      expect(() => {
        server.authorize('invalid')
      }).to.throw(Error, 'The token is not accepted');
      expect(() => {
        server.authorize('valid', null);
      }).to.throw(Error, 'You did not supply the data hash');
      expect(() => {
        server.authorize('valid', 1);
      }).to.throw(Error, 'Token not valid');
      clock.tick(constants.TOKEN_EXPIRE);
      expect(() => {
        server.authorize('valid', 'hash')
      }).to.throw(Error, 'Token expired');

    });

    it('should return the entry if authorized', function() {
      const server = new Server();
      server.accept('valid', 'hash');
      expect(typeof server.authorize('valid', 'hash')).to.equal('object');
    });

  });

  describe('@method upload', function() {

    const shard = Buffer.from('test shard');
    const hash = utils.rmd160sha256(shard).toString('hex');
    const sandbox = sinon.sandbox.create();
    const contracts = levelup('', {
      db: memdown,
      valueEncoding: 'json'
    });
    const identity = randomBytes(20);

    before((done) => {
      contracts.put(`${hash}:xpub`, {
        data_hash: hash,
        data_size: shard.length
      }, done);
    });

    after(() => {
      sandbox.restore()
    });

    it('should respond with 401 if not authorized', function(done) {
      const server = new Server({ contracts, identity });
      const [req, res] = createMocks({
        method: 'POST',
        path: '/shards/hash',
        query: {
          token: 'token'
        },
        params: {
          hash: 'hash'
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(401);
        done();
      });
      server.upload(req, res);
    });

    it('should respond with 404 if contract not found', function(done) {
      const server = new Server({ contracts, identity });
      const [req, res] = createMocks({
        method: 'POST',
        path: '/shards/hash',
        query: {
          token: 'token'
        },
        params: {
          hash: 'hash'
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(404);
        done();
      });
      server.accept('token', 'hash', ['identity', { xpub: 'xpub' }]);
      server.upload(req, res);
    });

    it('should respond with 400 if size exceeds expected', function(done) {
      const shards = {
        createWriteStream: function(key, callback) {
          let ws = new stream.Writable({ write: (d, e, cb) => cb() });
          ws.destroy = sandbox.stub().callsArg(0);
          callback(null, ws);
        }
      };
      const server = new Server({ contracts, identity, shards });
      const [req, res] = createMocks({
        method: 'POST',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(400);
        expect(res._getData()).to.equal(
          'Shard exceeds size defined in contract'
        );
        done();
      });
      server.accept('token', hash, [identity, { xpub: 'xpub' }]);
      server.upload(req, res);
      setTimeout(() => {
        req.emit('data', Buffer.from('a much longer shard test'));
      }, 50);
    });

    it('should respond with 400 if integrity fails', function(done) {
      const shards = {
        createWriteStream: function(key, callback) {
          let ws = new stream.Writable({ write: (d, e, cb) => cb() });
          ws.destroy = sandbox.stub().callsArg(0);
          callback(null, ws);
        }
      };
      const server = new Server({ contracts, identity, shards });
      const [req, res] = createMocks({
        method: 'POST',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(400);
        expect(res._getData()).to.equal('Hash does not match contract');
        done();
      });
      server.accept('token', hash, [identity, { xpub: 'xpub' }]);
      server.upload(req, res);
      setTimeout(() => {
        req.emit('data', randomBytes(shard.length));
        req.emit('end');
      }, 50);
    });

    it('should respond with 200 with upload accepted', function(done) {
      const shards = {
        createWriteStream: function(key, callback) {
          let ws = new stream.Writable({ write: (d, e, cb) => cb() });
          ws.destroy = sandbox.stub().callsArg(0);
          callback(null, ws);
        }
      };
      const server = new Server({ contracts, identity, shards });
      const [req, res] = createMocks({
        method: 'POST',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(200);
        done();
      });
      server.accept('token', hash, [identity, { xpub: 'xpub' }]);
      server.upload(req, res);
      setTimeout(() => {
        req.emit('data', shard);
        req.emit('end');
      }, 50);
    });

  });

  describe('@method download', function() {

    const sandbox = sinon.sandbox.create();
    const shard = Buffer.from('test shard');
    const hash = utils.rmd160sha256(shard).toString('hex');
    const identity = randomBytes(20);

    after(() => sandbox.restore());

    it('should respond with 401 if not authorized', function(done) {
      const server = new Server({ identity });
      const [req, res] = createMocks({
        method: 'GET',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(401);
        done();
      });
      server.download(req, res);
    });

    it('should respond with 404 if shard not found', function(done) {
      const shards = {
        createReadStream: function(key, callback) {
          callback(new Error('Not found'));
        }
      };
      const server = new Server({ identity, shards });
      const [req, res] = createMocks({
        method: 'GET',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(404);
        done();
      });
      server.accept('token', hash), [identity, { xpub: 'xpub' }];
      server.download(req, res);
    });

    it('should end the stream if there is an error', function(done) {
      const rs = new stream.Readable({ read: () => null });
      const shards = {
        createReadStream: function(key, callback) {
          callback(null, rs);
        }
      };
      const server = new Server({ identity, shards });
      const [req, res] = createMocks({
        method: 'GET',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res._getData()).to.equal('error after this');
        done();
      });
      server.accept('token', hash, [identity, { xpub: 'xpub' }]);
      server.download(req, res);
      setTimeout(() => {
        rs.push('error after this');
        rs.emit('error', new Error('Failed to read'));
      }, 50);
    });

    it('should respond with the shard data', function(done) {
      const parts = [shard, null];
      const rs = new stream.Readable({ read: () => rs.push(parts.shift()) });
      const shards = {
        createReadStream: function(key, callback) {
          callback(null, rs);
        }
      };
      const server = new Server({ identity, shards });
      const [req, res] = createMocks({
        method: 'GET',
        path: `/shards/${hash}`,
        query: {
          token: 'token'
        },
        params: {
          hash: hash
        }
      });
      res.on('end', () => {
        expect(res.statusCode).to.equal(200);
        expect(res._getData()).to.equal('test shard');
        done();
      });
      server.accept('token', hash, [identity, { xpub: 'xpub' }]);
      server.download(req, res);
    });

  });

  describe('@private @method _reapExpiredTokens', function() {

    const sandbox = sinon.sandbox.create();

    after(() => sandbox.restore());

    it('should reject tokens that are expired', function() {
      const clock = sandbox.useFakeTimers();
      const server = new Server();
      const reject = sandbox.stub(server, 'reject');
      server.accept('one', 'one');
      server.accept('two', 'two');
      server.accept('three', 'three');
      server.accept('four', 'four');
      const token = server._allowed.get('four');
      token.expires = Infinity;
      clock.tick(constants.TOKEN_EXPIRE + 1);
      server._reapExpiredTokens();
      expect(reject.callCount).to.equal(3);
    });

  });

});
