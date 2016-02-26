'use strict';

var FSStorageAdapter = require('../../../lib/storage/adapters/fs');
var StorageItem = require('../../../lib/storage/item');
var expect = require('chai').expect;
var utils = require('../../../lib/utils');
var Contract = require('../../../lib/contract');
var Audit = require('../../../lib/audit');

function tmpdir() {
  return require('os').tmpdir() + '/' + Date.now();
}

describe('FSStorageAdapter', function() {

  var store = new FSStorageAdapter(tmpdir());
  var hash = utils.rmd160('test');
  var audit = new Audit({ shard: new Buffer('test'), audit: 12 });
  var contract = new Contract();
  var item = new StorageItem({
    hash: hash,
    shard: new Buffer('test')
  });

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(FSStorageAdapter(tmpdir())).to.be.instanceOf(FSStorageAdapter);
    });

  });

  describe('#_put', function() {

    it('should store the item', function(done) {
      item.contracts[hash] = contract;
      item.challenges[hash] = audit.getPrivateRecord();
      item.trees[hash] = audit.getPublicRecord();
      store._put(hash, item, function(err) {
        expect(err).equal(null);
        done();
      });
    });

  });

  describe('#_get', function() {

    it('should return the stored item', function(done) {
      store._get(hash, function(err, item) {
        expect(err).to.equal(null);
        expect(item).to.be.instanceOf(StorageItem);
        done();
      });
    });

  });

});
