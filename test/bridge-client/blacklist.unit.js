/* jshint maxstatements: false */
/* jshint expr: true */

'use strict';


var Blacklist = require('../../lib/bridge-client/blacklist');
var fs = require('fs');
var expect = require('chai').expect;
var utils = require('../../lib/utils');
var sinon = require('sinon');

var tmpfolder = require('os').tmpdir();

describe('Blacklist', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Blacklist(tmpfolder)).to.be.instanceOf(Blacklist);
    });

    it('should create an instance with the given path', function() {
      var blacklist = new Blacklist(tmpfolder);
      expect(blacklist.blacklist).to.be.an('object');
      expect(utils.existsSync(blacklist.blacklistFile)).to.equal(true);
    });

  });

  describe('push', function() {

    it('should push the node id to an object with a timestamp', function() {
      var blacklist = new Blacklist(tmpfolder);
      blacklist.push('hi');
      expect(blacklist.blacklist.hi).to.not.be.undefined;
      fs.unlinkSync(blacklist.blacklistFile);
    });

  });

  describe('toObject', function() {

    it('should create an instance with the given path', function() {
      var blacklist = new Blacklist(tmpfolder);
      blacklist.push('hi');
      blacklist.push('hi2');
      blacklist.push('hi3');
      expect(blacklist.toObject()).to.include('hi', 'hi2', 'hi3');
      fs.unlinkSync(blacklist.blacklistFile);
    });

  });

  describe('_reap', function() {

    it('should reap old nodeids', function() {
      var blacklist = new Blacklist(tmpfolder);
      var clock = sinon.useFakeTimers();
      blacklist.push('hi');
      clock.tick(86400001);
      blacklist.push('hi2');
      blacklist.push('hi3');
      blacklist._reap(blacklist.blacklist);
      expect(blacklist.toObject()).to.not.include('hi');
      expect(blacklist.toObject()).to.include('hi2');

      clock.restore();
      fs.unlinkSync(blacklist.blacklistFile);
    });

  });

});
