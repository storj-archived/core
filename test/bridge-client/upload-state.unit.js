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

    it('should unlink the tmpfile if it exists', function(done) {
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
      uploadState.cleanQueue.push({
        store: {
          exists: function(key, cb) {
            return cb(null, true);
          },
          remove: function() {
            return done();
          }
        }
      });
      uploadState.cleanup();
    });

    it('should close uploaders', function(done) {
      var StubUploadState = proxyquire('../../lib/bridge-client/upload-state', {
      });
      var uploadState = new StubUploadState();
      var end = false;
      uploadState.uploaders = [{
        end: function() {
          done();
        }
      }];
      uploadState.cleanup();
    });

    it('should handle non-existant keys', function(done) {
      var StubUploadState = proxyquire('../../lib/bridge-client/upload-state', {
      });
      var uploadState = new StubUploadState();
      uploadState.cleanQueue.push({
        store: {
          exists: function(key, cb) {
            return cb(null, false);
          }
        }
      });
      uploadState.cleanup(function(e) {
        expect(e).to.be.equal(null);
        done();
      });
    });

  });

});
