'use strict';

var crypto = require('crypto');
var memdown = require('memdown');
var LevelDBStorageAdapter = require('../../../lib/storage/adapters/level');
var FileStore = require('../../../lib/storage/adapters/level/file-store');
var LevelDBFileStore = FileStore;
var StorageItem = require('../../../lib/storage/item');
var expect = require('chai').expect;
var utils = require('../../../lib/utils');
var Contract = require('../../../lib/contract');
var AuditStream = require('../../../lib/audit-tools/audit-stream');
var sinon = require('sinon');

function tmpdir() {
  return require('os').tmpdir() + '/test-' + Date.now() + '.db';
}

var store = new LevelDBStorageAdapter(tmpdir(), memdown);
var hash = utils.rmd160('test');
var audit = new AuditStream(12);
var contract = new Contract();
var item = new StorageItem({
  hash: hash,
  shard: new Buffer('test')
});

before(function() {
  audit.end(Buffer('test'));
});

describe('LevelDBStorageAdapter', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(
        LevelDBStorageAdapter(tmpdir(), memdown)
      ).to.be.instanceOf(LevelDBStorageAdapter);
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

    it('should bubble error if the underlying db#put fails', function(done) {
      var _put = sinon.stub(store._db, 'put').callsArgWith(
        3,
        new Error('Failed')
      );
      store._put(hash, item, function(err) {
        expect(err.message).equal('Failed');
        _put.restore();
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

    it('should return error if the data is not found', function(done) {
      var _dbget = sinon.stub(store._db, 'get').callsArgWith(
        2,
        new Error('Not found')
      );
      store._get(hash, function(err) {
        expect(err.message).to.equal('Not found');
        _dbget.restore();
        done();
      });
    });

  });

  describe('#_peek', function() {

    it('should return the stored item', function(done) {
      store._peek(hash, function(err, item) {
        expect(err).to.equal(null);
        expect(item).to.be.instanceOf(StorageItem);
        done();
      });
    });

    it('should return error if the data is not found', function(done) {
      var _dbpeek = sinon.stub(store._db, 'get').callsArgWith(
        2,
        new Error('Not found')
      );
      store._peek(hash, function(err) {
        expect(err.message).to.equal('Not found');
        _dbpeek.restore();
        done();
      });
    });

  });

  describe('#_keys', function() {

    it('should return all of the keys', function(done) {
      store._keys(function(err, keys) {
        expect(keys[0]).to.equal('5e52fee47e6b070565f74372468cdc699de89107');
        done();
      });
    });

  });

  describe('#_del', function() {

    it('should return error if del fails', function(done) {
      var _dbdel = sinon.stub(store._db, 'del').callsArgWith(
        1,
        new Error('Failed to delete')
      );
      store._del(hash, function(err) {
        expect(err.message).to.equal('Failed to delete');
        _dbdel.restore();
        done();
      });
    });

    it('should return error if reset fails', function(done) {
      var _storereset = sinon.stub(store._fs, 'reset').callsArgWith(
        1,
        new Error('Failed to delete')
      );
      store._del(hash, function(err) {
        expect(err.message).to.equal('Failed to delete');
        _storereset.restore();
        done();
      });
    });

    it('should delete the shard if it exists', function(done) {
      store._del(hash, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#_size', function() {

    it('should bubble errors from size calculation', function(done) {
      var _approx = sinon.stub(store._db.db, 'approximateSize').callsArgWith(
        2,
        new Error('Failed')
      );
      store._isUsingDefaultBackend = true;
      store._size(function(err) {
        _approx.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should return the size of the store on disk', function(done) {
      var _approx = sinon.stub(store._db.db, 'approximateSize').callsArgWith(
        2,
        null,
        7 * 1024
      );
      store._isUsingDefaultBackend = true;
      store._size(function(err, size) {
        _approx.restore();
        expect(size).to.equal(7 * 1024);
        done();
      });
    });

  });

  describe('#_open', function() {

    it('should callback null if already open', function(done) {
      store._open(function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should open the db if closed', function(done) {
      store._isOpen = false;
      var open = sinon.stub(store._db, 'open').callsArgWith(0, null);
      store._open(function(err) {
        open.restore();
        expect(open.called).to.equal(true);
        expect(err).to.equal(null);
        done();
      });
    });

    it('should bubble error if db open fails', function(done) {
      store._isOpen = false;
      var open = sinon.stub(store._db, 'open').callsArgWith(
        0,
        new Error('Failed')
      );
      store._open(function(err) {
        store._isOpen = true;
        open.restore();
        expect(open.called).to.equal(true);
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#_close', function() {

    it('should callback null if already closed', function(done) {
      store._isOpen = false;
      store._close(function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should close the db if open', function(done) {
      store._isOpen = true;
      var close = sinon.stub(store._db, 'close').callsArgWith(0, null);
      store._close(function(err) {
        close.restore();
        expect(close.called).to.equal(true);
        expect(err).to.equal(null);
        done();
      });
    });

    it('should bubble error if db close fails', function(done) {
      store._isOpen = true;
      var close = sinon.stub(store._db, 'close').callsArgWith(
        0,
        new Error('Failed')
      );
      store._close(function(err) {
        store._isOpen = true;
        close.restore();
        expect(close.called).to.equal(true);
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

});

describe('LevelDBFileStore', function() {

  var store = new LevelDBStorageAdapter('filestore', memdown)._db;
  var sample = crypto.randomBytes(8);

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(LevelDBFileStore(store)).to.be.instanceOf(LevelDBFileStore);
    });

    it('should create instance with the new keyword', function() {
      expect(new LevelDBFileStore(store)).to.be.instanceOf(LevelDBFileStore);
    });

  });

  describe('#createReadStream', function() {

    it('should emit an error event if operation fails', function(done) {
      var _get = sinon.stub(store, 'get').callsArgWith(2, new Error('FAIL'));
      var rs = LevelDBFileStore(store).createReadStream('testkey');
      rs.on('error', function(err) {
        _get.restore();
        expect(err.message).to.equal('FAIL');
        done();
      });
      setImmediate(function() {
        rs.read();
      });
    });

  });

  describe('#createWriteStream', function() {

    it('should emit an error event if operation fails', function(done) {
      var _put = sinon.stub(store, 'put').callsArgWith(3, new Error('FAIL'));
      var ws = LevelDBFileStore(store).createWriteStream('testkey');
      ws.on('error', function(err) {
        _put.restore();
        expect(err.message).to.equal('FAIL');
        done();
      });
      setImmediate(function() {
        ws.write(Buffer('test'));
      });
    });

  });

  describe('#createReadStream/#createWriteStream', function() {

    it('should work with hex encoding', function(done) {
      var data = Buffer(sample.toString('hex'), 'hex');
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('hex');
      ws.on('finish', function() {
        var result = Buffer([]);
        var rs = fs.createReadStream('hex');
        rs.on('data', function(data) {
          result = Buffer.concat([result, data]);
        }).on('end', function() {
          expect(Buffer.compare(sample, result)).to.equal(0);
          done();
        });
      }).end(data);
    });

    it('should expose a destroy method', function(done) {
      var data = crypto.randomBytes(16);
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('destroyme');
      ws.on('finish', function() {
        var rs = fs.createReadStream('destroyme');
        rs.destroy(function() {
          rs.destroy(); // Should be idempotent and optional callback
          done();
        });
      }).end(data);
    });

    it('should work with base64 encoding', function(done) {
      var data = Buffer(sample.toString('base64'), 'base64');
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('base64');
      ws.on('finish', function() {
        var result = Buffer([]);
        var rs = fs.createReadStream('base64');
        rs.on('data', function(data) {
          result = Buffer.concat([result, data]);
        }).on('end', function() {
          expect(Buffer.compare(sample, result)).to.equal(0);
          done();
        });
      }).end(data);
    });

    it('should work with utf8 encoding', function(done) {
      var data = Buffer(sample);
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('utf8');
      ws.on('finish', function() {
        var result = Buffer([]);
        var rs = fs.createReadStream('utf8');
        rs.on('data', function(data) {
          result = Buffer.concat([result, data]);
        }).on('end', function() {
          expect(Buffer.compare(sample, result)).to.equal(0);
          done();
        });
      }).end(data);
    });

    it('should work with binary encoding', function(done) {
      var data = Buffer(sample.toString('binary'), 'binary');
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('binary');
      ws.on('finish', function() {
        var result = Buffer([]);
        var rs = fs.createReadStream('binary');
        rs.on('data', function(data) {
          result = Buffer.concat([result, data]);
        }).on('end', function() {
          expect(Buffer.compare(sample, result)).to.equal(0);
          done();
        });
      }).end(data);
    });

    it('should work with utf16le encoding', function(done) {
      var data = Buffer(sample.toString('utf16le'), 'utf16le');
      var fs = new LevelDBFileStore(store);
      var ws = fs.createWriteStream('utf16le');
      ws.on('finish', function() {
        var result = Buffer([]);
        var rs = fs.createReadStream('utf16le');
        rs.on('data', function(data) {
          result = Buffer.concat([result, data]);
        }).on('end', function() {
          expect(Buffer.compare(sample, result)).to.equal(0);
          done();
        });
      }).end(data);
    });

  });

  describe('#reset', function() {

    it('should delete the item if it exists', function(done) {
      var fs = new LevelDBFileStore(store);
      var _get = sinon.stub(fs._db, 'get').callsArg(1);
      var _del = sinon.stub(fs._db, 'del', function(k, cb) {
        _get.restore();
        cb();
      });
      fs.reset('key', function() {
        _del.restore();
        expect(_del.called).to.equal(true);
        done();
      });
    });

  });

});
