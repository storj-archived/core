'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Manager = require('../lib/manager');
var RAMStorageAdapter = require('../lib/storage/adapters/ram');
var utils = require('../lib/utils');
var StorageItem = require('../lib/storage/item');

describe('Manager', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Manager(new RAMStorageAdapter())).to.be.instanceOf(Manager);
    });

  });

  describe('#load', function() {

    it('should throw if the adapter returns invalid item', function(done) {
      var adapter = new RAMStorageAdapter();
      adapter._get = sinon.stub().callsArgWith(1, null, {});
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

  });

  describe('#clean', function() {

    it('should clean the expired contracts', function(done) {
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
            audit_count: 2
          }
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

});
