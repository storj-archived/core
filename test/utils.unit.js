'use strict';

var expect = require('chai').expect;
var utils = require('../lib/utils');
var semver = require('semver');
var version = require('../lib/version');

describe('utils', function() {

  describe('#getContactURL', function() {

    it('should return the proper URI format of the contact', function() {
      expect(utils.getContactURL({
        address: '127.0.0.1',
        port: 1337,
        nodeID: '7a728a8c27fa378cafbd300c1e38639362f87ee8'
      })).to.equal(
        'storj://127.0.0.1:1337/7a728a8c27fa378cafbd300c1e38639362f87ee8'
      );
    });

  });

  describe('#isCompatibleVersion', function() {

    it('should be compatible (same version)', function() {
      expect(utils.isCompatibleVersion(version)).to.equal(true);
    });

    it('should not be compatible (different major)', function() {
      expect(utils.isCompatibleVersion('999.0.0')).to.equal(false);
    });

    it('should be compatible (different patch)', function() {
      expect(
        utils.isCompatibleVersion(semver.inc(version, 'patch'))
      ).to.equal(true);
    });

    it('should not be compatible (different build tag)', function() {
      expect(utils.isCompatibleVersion(version + '-buildtag')).to.equal(false);
    });

  });

});
