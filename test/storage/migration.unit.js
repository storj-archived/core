'use strict';

var StorageItem = require('../../lib/storage/item');
var StorageMigration = require('../../lib/storage/migration');
var EmbeddedStorageAdapter = require('../../lib/storage/adapters/embedded');
var expect = require('chai').expect;
var sinon = require('sinon');
var utils = require('../../lib/utils');
var os = require('os');
var rimraf = require('rimraf');
var path = require('path');
var TMP_DIR = path.join(os.tmpdir(), 'STORJ_MIGRATION_TEST');
var mkdirp = require('mkdirp');

function _p(n) {
  return path.join(TMP_DIR, n);
}

describe('StorageMigration', function() {

  before(function() {
    if (utils.existsSync(TMP_DIR)) {
      rimraf.sync(TMP_DIR);
    }
    mkdirp.sync(TMP_DIR);
  });

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(StorageMigration(
        EmbeddedStorageAdapter(_p('t1')),
        EmbeddedStorageAdapter(_p('t2'))
      )).to.be.instanceOf(StorageMigration);
    });

    it('should create an instance with the new keyword', function() {
      expect(new StorageMigration(
        EmbeddedStorageAdapter(_p('t3')),
        EmbeddedStorageAdapter(_p('t4'))
      )).to.be.instanceOf(StorageMigration);
    });

    it('should throw if given an invalid storage adapter', function() {
      expect(function() {
        StorageMigration({}, {});
      }).to.throw(Error, 'Invalid storage adapter supplied');
    });

  });

  describe('#start', function() {

    var source, target;

    before(function(done) {
      source = new EmbeddedStorageAdapter(_p('t5'));
      target = new EmbeddedStorageAdapter(_p('t6'));

      source.put(StorageItem({
        hash: utils.rmd160('item one')
      }), function() {
        source.put(StorageItem({
          hash: utils.rmd160('item two')
        }), function() {
          source.get(utils.rmd160('item one'), function(err, item) {
            expect(err).to.equal(null);
            item.shard.write(Buffer('item one'));
            item.shard.end();
            source.get(utils.rmd160('item two'), function(err, item) {
              item.shard.write(Buffer('item two'));
              item.shard.end();
              done();
            });
          });
        });
      });
    });

    it('should successfully migrate the storage items', function(done) {
      var migration = new StorageMigration(source, target);
      migration.on('finish', function() {
        target.get(utils.rmd160('item one'), function(err, item) {
          expect(err).to.equal(null);
          expect(item.hash).to.equal(utils.rmd160('item one'));
          item.shard.once('data', function(data) {
            expect(data.toString()).to.equal('item one');
            target.get(utils.rmd160('item two'), function(err, item) {
              expect(err).to.equal(null);
              expect(item.hash).to.equal(utils.rmd160('item two'));
              item.shard.once('data', function(data) {
                expect(data.toString()).to.equal('item two');
                done();
              });
            });
          });
        });
      });
      migration.start();
    });

    it('should bubble errors from target#put', function(done) {
      var migration = new StorageMigration(source, target);
      var _put = sinon.stub(target, 'put').callsArgWith(
        1,
        new Error('Failed to put item')
      );
      migration.on('error', function(err) {
        expect(err.message).to.equal('Failed to put item');
        _put.restore();
        done();
      });
      migration.start();
    });

    it('should bubble errors from target#get', function(done) {
      var migration = new StorageMigration(source, target);
      var _get = sinon.stub(target, 'get').callsArgWith(
        1,
        new Error('Failed to get item')
      );
      migration.on('error', function(err) {
        expect(err.message).to.equal('Failed to get item');
        _get.restore();
        done();
      });
      migration.start();
    });

  });

  describe('#stop', function() {

    it('should null the source stream and remove listeners', function() {
      var source = new EmbeddedStorageAdapter(_p('t7'));
      var target = new EmbeddedStorageAdapter(_p('t8'));
      var migration = new StorageMigration(source, target);
      migration._sourceStream = { removeAllListeners: function() {} };
      migration.readyState = StorageMigration.STARTED;
      var _sourceStream = sinon.stub(
        migration._sourceStream,
        'removeAllListeners'
      );
      migration.stop();
      expect(_sourceStream.called).to.equal(true);
      expect(migration._sourceStream).to.equal(null);
    });

  });

  describe('#_handleSourceError', function() {

    it('should bubble errors passed to _handleSourceError', function(done) {
      var source = new EmbeddedStorageAdapter(_p('t9'));
      var target = new EmbeddedStorageAdapter(_p('t10'));
      var migration = new StorageMigration(source, target);
      migration.on('error', function(err) {
        expect(err.message).to.equal('Source error');
        expect(migration._sourceStream).to.equal(null);
        done();
      })._handleSourceError(new Error('Source error'));
    });

  });

  describe('#_handleSourceObject', function() {

    it('should resume stream if there is no readable shard', function(done) {
      var source = new EmbeddedStorageAdapter(_p('t11'));
      var target = new EmbeddedStorageAdapter(_p('t12'));
      var _sourcePut = sinon.stub(source, 'put').callsArg(1);
      var _targetGet = sinon.stub(target, 'get').callsArg(1);
      var _sourceGet = sinon.stub(source, 'get').callsArgWith(1, null, {
        shard: {}
      });
      var migration = new StorageMigration(source, target);
      var item = StorageItem({
        hash: utils.rmd160('item three')
      });
      item.shard = {};
      migration._sourceStream = {
        pause: sinon.stub(),
        resume: sinon.stub()
      };
      migration._handleSourceObject(item, null, function(err) {
        _sourcePut.restore();
        _targetGet.restore();
        _sourceGet.restore();
        done(err);
      });
    });

    it('should emit error if source#get fails', function(done) {
      var source = new EmbeddedStorageAdapter(_p('t13'));
      var target = new EmbeddedStorageAdapter(_p('t14'));
      var _sourcePut = sinon.stub(source, 'put').callsArg(1);
      var _targetGet = sinon.stub(target, 'get').callsArg(1);
      var _sourceGet = sinon.stub(source, 'get').callsArgWith(
        1,
        new Error('Failed')
      );
      var migration = new StorageMigration(source, target);
      var item = StorageItem({
        hash: utils.rmd160('item three')
      });
      item.shard = {};
      migration._sourceStream = {
        pause: sinon.stub(),
        resume: sinon.stub()
      };
      migration._handleSourceObject(item, null, function(err) {
        _sourcePut.restore();
        _targetGet.restore();
        _sourceGet.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  after(function() {
    rimraf.sync(TMP_DIR);
  });

});
