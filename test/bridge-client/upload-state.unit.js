'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var UploadState = require('../lib/uploadstate');

describe('UploadState', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(UploadState()).to.be.instanceOf(UploadState);
    });

  });

  describe('#cleanup', function() {

    it('should unlink the tmpfile if it exists', function() {
      var unlinkSync = sinon.stub();
      var StubbedUploadState = proxyquire('../lib/uploadstate', {
        fs: {
          existsSync: sinon.stub().returns(true),
          unlinkSync: unlinkSync
        }
      });
      var uploadState = new StubbedUploadState();
      uploadState.cleanQueue.push('/some/tmp/file');
      uploadState.cleanup();
      expect(unlinkSync.called).to.equal(true);
    });

  });

});
