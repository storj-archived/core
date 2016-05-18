'use strict';

var StorageItem = require('../../lib/storage/item');
var StorageMigration = require('../../lib/storage/migration');
var LevelDBStorageAdapter = require('../../lib/storage/adapters/level');
var expect = require('chai').expect;
var sinon = require('sinon');
var utils = require('../../lib/utils');
var memdown = require('memdown');

describe('StorageMigration', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(StorageMigration(
        LevelDBStorageAdapter('t1', memdown),
        LevelDBStorageAdapter('t2', memdown)
      )).to.be.instanceOf(StorageMigration);
    });

    it('should create an instance with the new keyword', function() {
      expect(new StorageMigration(
        LevelDBStorageAdapter('t3', memdown),
        LevelDBStorageAdapter('t4', memdown)
      )).to.be.instanceOf(StorageMigration);
    });

    it('should throw if given an invalid storage adapter', function() {
      expect(function() {
        StorageMigration({}, {});
      }).to.throw(Error, 'Invalid storage adapter supplied');
    });

  });

  describe('#start', function() {

    var source = new LevelDBStorageAdapter('t5', memdown);
    var target = new LevelDBStorageAdapter('t6', memdown);

    before(function(done) {
      source.put(StorageItem({
        hash: utils.rmd160('item one')
      }), function() {
        source.put(StorageItem({
          hash: utils.rmd160('item two')
        }), function() {
          source.get(utils.rmd160('item one'), function(err, item) {
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
            done();
          });
        });
        done();
      }).start();
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
      }).start();
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
      }).start();
    });

  });

  describe('#stop', function() {

    it('should null the source stream and remove listeners', function() {
      var source = new LevelDBStorageAdapter('t7', memdown);
      var target = new LevelDBStorageAdapter('t8', memdown);
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
      var source = new LevelDBStorageAdapter('t9', memdown);
      var target = new LevelDBStorageAdapter('t10', memdown);
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
      var source = new LevelDBStorageAdapter('t11', memdown);
      var target = new LevelDBStorageAdapter('t12', memdown);
      var _sourcePut = sinon.stub(source, 'put').callsArg(1);
      var _targetGet = sinon.stub(target, 'get').callsArg(1);
      var migration = new StorageMigration(source, target);
      var item = StorageItem({
        hash: utils.rmd160('item three')
      });
      item.shard = {};
      migration._sourceStream = {
        pause: sinon.stub(),
        resume: sinon.stub()
      };
      migration._handleSourceObject(item);
      setImmediate(function() { // NB: Wait for migration#_handleSourceObject
        setImmediate(function() { // NB: Wait for target#put
          setImmediate(function() { // NB: Wait for source#get
            expect(migration._sourceStream.resume.called).to.equal(true);
            _sourcePut.restore();
            _targetGet.restore();
            done();
          });
        });
      });
    });

  });

});
