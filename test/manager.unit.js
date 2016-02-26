'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Manager = require('../lib/manager');
var RAMStorageAdapter = require('../lib/storage/adapters/ram');
var utils = require('../lib/utils');

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

  });

});
