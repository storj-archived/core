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



  });

  describe('#accept', function() {

    it('should should add the token/hash to the accepted list', function() {
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



  });

  describe('#isAuthorized', function() {



  });

  describe('#routeConsignment', function() {



  });

  describe('#routeRetrieval', function() {



  });

});
