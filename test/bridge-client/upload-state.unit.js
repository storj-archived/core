'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var UploadState = require('../../lib/bridge-client/upload-state');

describe('UploadState', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(UploadState()).to.be.instanceOf(UploadState);
    });

  });

  describe('#cleanup', function() {

    it('should unlink the tmpfile if it exists', function() {
      var rimrafSync = sinon.stub();
      var StubUploadState = proxyquire('../../lib/bridge-client/upload-state', {
        rimraf: {
          sync: rimrafSync
        },
        '../utils': {
          existsSync: sinon.stub().returns(true)
        }
      });
      var uploadState = new StubUploadState();
      uploadState.cleanQueue.push('/some/tmp/file');
      uploadState.cleanup();
      expect(rimrafSync.called).to.equal(true);
    });

  });

});
