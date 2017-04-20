'use strict';

var utils = require('../../../lib/utils');
var expect = require('chai').expect;
var TriggerManager = require('../../../lib/sips/0003').TriggerManager;

describe('TriggerManager', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(TriggerManager()).to.be.instanceOf(TriggerManager);
    });

  });

  describe('#add', function() {

    it('should add the behavior for the nodeID', function() {
      var triggers = new TriggerManager();
      triggers.add('somenodeid', { noop: utils.noop });
      expect(triggers._authorized.noop[0]).to.equal('somenodeid');
      expect(triggers._behaviors['somenodeid:noop']).to.equal(utils.noop);
    });

    it('should add the behavior for all the nodeIDs', function() {
      var triggers = new TriggerManager();
      triggers.add(['node1', 'node2', 'node1'], { noop: utils.noop });
      expect(triggers._authorized.noop[0]).to.equal('node1');
      expect(triggers._authorized.noop[1]).to.equal('node2');
      expect(triggers._behaviors['node1:noop']).to.equal(utils.noop);
      expect(triggers._behaviors['node2:noop']).to.equal(utils.noop);
    });

  });

  describe('#remove', function() {

    it('should remove the behavior for the nodeID', function() {
      var triggers = new TriggerManager();
      triggers.add('somenodeid', { noop: utils.noop });
      triggers.remove('somenodeid', 'noop');
      triggers.remove('someothernode', 'noop'); // Should just do nothing
      triggers.remove('someothernode', 'behavior'); // Should just do nothing
      expect(triggers._authorized.noop[0]).to.equal(undefined);
      expect(triggers._behaviors['somenodeid:noop']).to.equal(undefined);
    });

    it('should remove the behavior for all the nodeIDs', function() {
      var triggers = new TriggerManager();
      triggers.add(['node1', 'node2'], { noop: utils.noop });
      triggers.remove(['node1', 'node2'], 'noop');
      expect(triggers._authorized.noop[0]).to.equal(undefined);
      expect(triggers._behaviors['node1:noop']).to.equal(undefined);
      expect(triggers._authorized.noop[1]).to.equal(undefined);
      expect(triggers._behaviors['node2:noop']).to.equal(undefined);
    });

    it('should remove the all the behavior for all the nodeIDs', function() {
      var triggers = new TriggerManager();
      triggers.add(['node1', 'node2'], {
        noop1: utils.noop,
        noop2: utils.noop
      });
      triggers.remove(['node1', 'node2'], ['noop1', 'noop2']);
      expect(triggers._authorized.noop1[0]).to.equal(undefined);
      expect(triggers._behaviors['node1:noop1']).to.equal(undefined);
      expect(triggers._behaviors['node1:noop2']).to.equal(undefined);
      expect(triggers._authorized.noop1[1]).to.equal(undefined);
      expect(triggers._behaviors['node2:noop1']).to.equal(undefined);
      expect(triggers._behaviors['node2:noop2']).to.equal(undefined);
    });

  });

  describe('#process', function() {

    it('should fail if not defined', function(done) {
      var triggers = new TriggerManager();
      triggers.process({
        behavior: 'test',
        contact: { nodeID: 'nodeid' }
      }, function(err) {
        expect(err.message).to.equal('No trigger handler defined for behavior');
        done();
      });
    });

    it('should fail if not authorized', function(done) {
      var triggers = new TriggerManager();
      triggers.add('notnodeid', { test: utils.noop });
      triggers.process({
        behavior: 'test',
        contact: { nodeID: 'nodeid' }
      }, function(err) {
        expect(err.message).to.equal('Not authorized to process trigger');
        done();
      });
    });

    it('should succeed if authorized and defined', function(done) {
      var triggers = new TriggerManager();
      triggers.add('nodeid', {
        test: function(params, replyToSender, destroyTrigger) {
          destroyTrigger();
          replyToSender(null, { test: 'test' });
        }
      });
      triggers.process({
        behavior: 'test',
        contact: { nodeID: 'nodeid' }
      }, function(err, result) {
        expect(result.test).to.equal('test');
        expect(triggers._authorized.test[0]).to.equal(undefined);
        expect(triggers._behaviors['nodeid:test']).to.equal(undefined);
        done();
      });
    });

  });

});
