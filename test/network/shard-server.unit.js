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
var utils = require('../../lib/utils');

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



  });

  describe('#routeRetrieval', function() {



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
