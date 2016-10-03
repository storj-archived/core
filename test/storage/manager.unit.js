'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Manager = require('../../lib/storage/manager');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var utils = require('../../lib/utils');
var StorageItem = require('../../lib/storage/item');

describe('Manager', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Manager(new RAMStorageAdapter())).to.be.instanceOf(Manager);
    });

    it('should not start the reaper if disabled', function(done) {
      var _clean = sinon.stub(Manager.prototype, 'clean');
      var man = new Manager(RAMStorageAdapter(), {
        disableReaper: true
      });
      setImmediate(function() {
        _clean.restore();
        expect(man._options.disableReaper).to.equal(true);
        expect(_clean.called).to.equal(false);
        done();
      });
    });

  });

  describe('#load', function() {

    it('should throw if the adapter returns invalid item', function(done) {
      var adapter = new RAMStorageAdapter();
      adapter.get = sinon.stub().callsArgWith(1, null, {});
      var man = new Manager(adapter);
      man.load(utils.rmd160('key'), function(err) {
        expect(err.message).to.equal('Storage adapter provided invalid result');
        done();
      });
    });

    it('should bubble errors from the storage adapter', function(done) {
      var adapter = new RAMStorageAdapter();
      adapter._get = sinon.stub().callsArgWith(1, new Error('Some error'));
      var man = new Manager(adapter);
      man.load(utils.rmd160('key'), function(err) {
        expect(err.message).to.equal('Some error');
        done();
      });
    });

    it('should callback with the loaded item', function(done) {
      var adapter = new RAMStorageAdapter();
      adapter._get = sinon.stub().callsArgWith(1, null, new StorageItem());
      var man = new Manager(adapter);
      man.load(utils.rmd160('key'), function(err, item) {
        expect(item).to.be.instanceOf(StorageItem);
        done();
      });
    });

  });

  describe('#clean', function() {

    it('should clean the expired or incomplete contracts', function(done) {
      var adapter = new RAMStorageAdapter();
      var man = new Manager(adapter);
      man.save(new StorageItem({
        hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
        contracts: {
          nodeid1: {
            renter_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            data_size: 10,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now() - 5000,
            store_end: Date.now() - 2500,
            audit_count: 2
          },
          nodeid2: {
            renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
            data_size: 10,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2,
            renter_signature: 'signaturegoeshere',
            farmer_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            farmer_signature: 'signaturegoeshere',
            payment_storage_price: 0,
            payment_download_price: 0,
            payment_destination: '12PzSwsCT5LBT3nhW6GoCJQpAJAZ7CkpBg'
          },
          nodeid3: {
            renter_id: '4da1b82394f83847ee9a412af9d01b05dea54a0b',
            data_size: 10,
            data_hash: '7a728a8c27fa378cafbd300c1e38639362f87ee8',
            store_begin: Date.now(),
            store_end: Date.now() + 2500,
            audit_count: 2
          },
        }
      }), function() {
        man.save(new StorageItem({
          hash: '4266db5cc0141c685194bc233c0989282a3e2340',
          contracts: {
            nodeid3: {
              renter_id: 'dd2f8bdfb1769ccafb943c7c29a1bcc13a850b8f',
              data_size: 10,
              data_hash: '4266db5cc0141c685194bc233c0989282a3e2340',
              store_begin: Date.now() - 5000,
              store_end: Date.now() - 2500,
              audit_count: 2
            }
          }
        }), function() {
          adapter._shards = {
            '7a728a8c27fa378cafbd300c1e38639362f87ee8': Buffer('test1'),
            '4266db5cc0141c685194bc233c0989282a3e2340': Buffer('test2')
          };
          man.clean(function() {
            expect(Object.keys(adapter._shards)).to.have.lengthOf(1);
            done();
          });
        });
      });
    });

  });

  describe('#_checkCapacity', function() {

    it('should emit an error if size fails', function(done) {
      var db = new RAMStorageAdapter();
      var _size = sinon.stub(db, '_size', function(callback) {
        setTimeout(function() {
          callback(new Error('Failed'));
        }, 10);
      });
      var man = new Manager(db);
      man.on('error', function(err) {
        _size.restore();
        expect(err.message).to.equal('Failed');
        done();
      })._checkCapacity();
    });

    it('should emit locked if the status changes', function(done) {
      var db = new RAMStorageAdapter();
      var _size = sinon.stub(db, '_size').callsArgWith(0, null, 1);
      var man = new Manager(db, { maxCapacity: 0 });
      man.on('locked', function() {
        _size.restore();
        done();
      })._checkCapacity();
    });

    it('should emit unlocked if the status changes', function(done) {
      var db = new RAMStorageAdapter();
      var _size = sinon.stub(db, '_size').callsArgWith(0, null, 5);
      var man = new Manager(db, { maxCapacity: 10 });
      man._capacityReached = true;
      man.on('unlocked', function() {
        _size.restore();
        done();
      })._checkCapacity();
    });

  });

  describe('#save', function() {

    it('should return error if capacity reached', function(done) {
      var man = new Manager(new RAMStorageAdapter());
      man._capacityReached = true;
      man.save(StorageItem(), function(err) {
        expect(err.message).to.equal('Storage capacity reached');
        done();
      });
    });

    it('should bubble error from underlying db', function(done) {
      var db = new RAMStorageAdapter();
      var man = new Manager(db);
      var _peek = sinon.stub(db, 'peek').callsArgWith(1, new Error('Failed'));
      var _put = sinon.stub(db, '_put').callsArgWith(2, new Error('Failed'));
      var _get = sinon.stub(db, 'get').callsArgWith(1, new Error('Failed'));
      man.save(StorageItem(), function(err) {
        _put.restore();
        _peek.restore();
        _get.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

});
