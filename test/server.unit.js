'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const constants = require('../lib/constants');
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



  });

  describe('@method download', function() {



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
