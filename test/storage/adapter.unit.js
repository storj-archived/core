'use strict';

var sinon = require('sinon');
var utils = require('../../lib/utils');
var expect = require('chai').expect;
var StorageAdapter = require('../../lib/storage/adapter');

describe('StorageAdapter', function() {

  describe('@constructor', function() {

    it('should create and instance without the new keyword', function() {
      expect(StorageAdapter()).to.be.instanceOf(StorageAdapter);
    });

  });

  describe('#del', function() {

    it('should bubble errors from #peek', function(done) {
      var adapter = new StorageAdapter();
      var _peek = sinon.stub(adapter, 'peek').callsArgWith(
        1,
        new Error('Failed')
      );
      adapter.del(utils.rmd160('key'), function(err) {
        _peek.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should bubble errors from #_del', function(done) {
      var adapter = new StorageAdapter();
      var _peek = sinon.stub(adapter, 'peek').callsArgWith(
        1,
        null
      );
      var _del = sinon.stub(adapter, '_del').callsArgWith(
        1,
        new Error('Failed')
      );
      adapter.del(utils.rmd160('key'), function(err) {
        _peek.restore();
        _del.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#_get', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._get();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#_del', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._del();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#_peek', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._peek();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#_put', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._put();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#_keys', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._keys();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#_size', function() {

    it('should throw a not implemented error', function() {
      expect(function() {
        StorageAdapter()._size();
      }).to.throw(Error, 'Method not implemented');
    });

  });

  describe('#createReadStream', function() {

    it('should emit an error if _keys fails', function(done) {
      var a = new StorageAdapter();
      var s = a.createReadStream();
      a._keys = function(callback) {
        callback(new Error('Something broke'));
      };
      s.on('error', function(err) {
        expect(err.message).to.equal('Something broke');
        done();
      }).read();
    });

    it('should emit an error if peek fails', function(done) {
      var a = new StorageAdapter();
      var s = a.createReadStream();
      a._keys = function(callback) {
        callback(null, [
          '1261d3f171c23169c893a21be1f03bacafad26d7',
          '5968d0cec66aefb9f4c7ffa5b2637152db1059cf'
        ]);
      };
      a.peek = function(key, callback) {
        callback(new Error('Shard data not found'));
      };
      s.on('error', function(err) {
        expect(err.message).to.equal('Shard data not found');
        done();
      }).read();
    });

    it('should emit an error if peek fails later', function(done) {
      var a = new StorageAdapter();
      var s = a.createReadStream();
      a._keys = function(callback) {
        callback(null, [
          '1261d3f171c23169c893a21be1f03bacafad26d7',
          '5968d0cec66aefb9f4c7ffa5b2637152db1059cf'
        ]);
      };
      a.peek = function(key, callback) {
        if (key === '5968d0cec66aefb9f4c7ffa5b2637152db1059cf') {
          callback(new Error('Shard data not found'));
        } else {
          callback(null, {});
        }
      };
      s.on('error', function(err) {
        expect(err.message).to.equal('Shard data not found');
        done();
      }).read();
    });

    it('should end the stream when all keys are read', function(done) {
      var a = new StorageAdapter();
      var s = a.createReadStream();
      a._keys = function(callback) {
        callback(null, []);
      };
      s.on('end', function() {
        done();
      }).read();
    });

  });

});
