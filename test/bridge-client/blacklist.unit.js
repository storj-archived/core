/* jshint maxstatements: false */
/* jshint expr: true */

'use strict';


var Blacklist = require('../../lib/bridge-client/blacklist');
var BridgeClient = require('../../lib/bridge-client');
var fs = require('fs');
var expect = require('chai').expect;
var utils = require('../../lib/utils');
var sinon = require('sinon');
var path = require('path');
var Stream = require('stream');
var tmpfolder = require('os').tmpdir();

describe('Blacklist', function() {

  describe('@constructor', function() {
    var client = BridgeClient();
    var blacklistFile = path.join(
      client._options.blacklistFolder,
      '.blacklist');
    client._options.blacklistFolder = tmpfolder;
    it('should create an instance without the new keyword', function() {
      expect(Blacklist(client._options)).to.be.instanceOf(Blacklist);
    });

    it('should create an instance with the given path', function(done) {
      var blacklist = new Blacklist(client._options);
      blacklist.push('foo', function() {
        expect(blacklist.blacklist).to.be.an('object');
        expect(utils.existsSync(blacklistFile)).to.equal(true);
        fs.unlinkSync(blacklistFile);
        done();
      });
    });

  });

  describe('push', function() {

    it('should push the node id to an object with a timestamp', function(d) {
      var client = BridgeClient();
      client._options.blacklistFolder = tmpfolder;
      var blacklist = new Blacklist(client._options);
      var blacklistFile = path.join(
        client._options.blacklistFolder,
        '.blacklist');
      blacklist.push('hi', function() {
        expect(blacklist.blacklist.hi).to.not.be.undefined;
        fs.unlinkSync(blacklistFile);
        d();
      });
    });

  });

  describe('toObject', function() {

    it('should create an instance with the given path', function(done) {
      var client = BridgeClient();
      client._options.blacklistFolder = tmpfolder;
      var blacklistFile = path.join(
        client._options.blacklistFolder,
        '.blacklist');
      var blacklist = new Blacklist(client._options);
      blacklist.push('hi', function() {
        blacklist.push('hi1', function() {
          blacklist.push('hi2', function() {
            blacklist.toObject(function(e, obj) {
              expect(e).to.equal(null);
              expect(obj).to.include('hi', 'hi2', 'hi3');
              fs.unlinkSync(blacklistFile);
              done();
            });
          });
        });
      });
    });

  });

  describe('_reap', function() {

    it('should reap old nodeids', function(done) {
      var client = BridgeClient();
      client._options.blacklistFolder = tmpfolder;
      var blacklist = new Blacklist(client._options);
      var clock = sinon.useFakeTimers();
      blacklist.push('hi', function() {
        clock.tick(86400001);
        blacklist.push('hi1', function() {
          blacklist.push('hi2', function() {
            blacklist.toObject(function(e, obj) {
              expect(obj).to.not.include('hi');
              expect(obj).to.include('hi1');
              expect(obj).to.include('hi2');
              clock.restore();
              done();
            });
          });
        });
      });
    });

  });

  describe('write conditions', function() {
    it('should only write one item at a time into the store', function(done) {
      var client = BridgeClient();
      var called = 0;
      client._options.store = {
        createReadStream: function() {
          var rs = new Stream.Readable();
          rs.push('{}');
          rs.push(null);
          return rs;
        },
        createWriteStream: function() {
          called++;
          var ws = Stream.Writable({
            write: function(data, enc, done) {
              expect(called).to.be.below(3);
              done();
              return {data:data, enc: enc};
            }
          });
          return ws;
        },
      };
      var blacklist = new Blacklist(client._options);
      var arr = [false, false, false];
      blacklist.push('1', function(err) {
        expect(called).to.equal(1);
        expect(arr[0]).to.equal(false);
        arr[0] = true;
        expect(err).to.not.be.instanceOf(Error);
      });
      blacklist.push('2', function(err) {
        expect(called).to.equal(2);
        expect(arr[0]).to.equal(true);
        expect(arr[1]).to.equal(false);
        arr[1] = true;
        expect(err).to.not.be.instanceOf(Error);
        if (arr[1] && arr[2]) {return done();}
      });
      blacklist.push('3', function(err) {
        expect(called).to.equal(2);
        expect(arr[0]).to.equal(true);
        expect(arr[2]).to.equal(false);
        arr[2] = true;
        expect(err).to.not.be.instanceOf(Error);
        if (arr[1] && arr[2]) {return done(); }
      });
    });

    it('callback should be optional', function(done) {
      var client = BridgeClient();
      var called = 0;
      client._options.store = {
        createReadStream: function() {
          var rs = new Stream.Readable();
          rs.push('{}');
          rs.push(null);
          return rs;
        },
        createWriteStream: function() {
          called++;
          var ws = Stream.Writable({
            write: function(data, enc, done) {
              expect(called).to.be.below(3);
              done();
              return {data:data, enc: enc};
            }
          });
          return ws;
        },
      };
      var blacklist = new Blacklist(client._options);
      blacklist.push('1');
      blacklist.push('2', function(err){
        expect(err).to.not.be.instanceOf(Error);
        done();
      });
    });

    it('should be able to read empty items without error', function(done) {
      var client = BridgeClient();
      var called = 0;
      client._options.store = {
        createReadStream: function() {
          var rs = new Stream.Readable();
          rs.push('{}');
          rs.push(null);
          return rs;
        },
        createWriteStream: function() {
          called++;
          var ws = Stream.Writable({
            write: function(data, enc, done) {
              expect(called).to.be.below(3);
              done();
              return {data:data, enc: enc};
            }
          });
          return ws;
        },
      };
      var blacklist = new Blacklist(client._options);
      blacklist.push();
      blacklist.push('1', function(err) {
        expect(err).to.not.be.instanceOf(Error);
        done();
      });
    });

    it('should return empty array if given incorrect JSON', function(done) {
      var client = BridgeClient();
      var called = 0;
      client._options.store = {
        createReadStream: function() {
          var rs = new Stream.Readable();
          rs.push('{"asdf": ,}');
          rs.push(null);
          return rs;
        },
        createWriteStream: function() {
          called++;
          var ws = Stream.Writable({
            write: function(data, enc, done) {
              expect(called).to.be.below(3);
              done();
              return {data:data, enc: enc};
            }
          });
          return ws;
        },
      };
      var blacklist = new Blacklist(client._options);
      blacklist.toObject(function(err, object) {
        expect(object).to.deep.equal([]);
        done();
      });
    });

    it('should return empty if file is empty', function(done) {
      var client = BridgeClient();
      var called = 0;
      client._options.store = {
        createReadStream: function() {
          var rs = new Stream.Readable();
          rs.push('');
          rs.push(null);
          return rs;
        },
        createWriteStream: function() {
          called++;
          var ws = Stream.Writable({
            write: function(data, enc, done) {
              expect(called).to.be.below(3);
              done();
              return {data:data, enc: enc};
            }
          });
          return ws;
        },
      };
      var blacklist = new Blacklist(client._options);
      blacklist.toObject(function(err, object) {
        expect(object).to.deep.equal([]);
        done();
      });
    });
  });
});
