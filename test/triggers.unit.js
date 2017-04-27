'use strict';

const utils = require('../lib/utils');
const { expect } = require('chai');
const Triggers = require('../lib/triggers');


describe('Triggers', function() {

  describe('#add', function() {

    it('should add the behavior for the identity', function() {
      const triggers = new Triggers();
      triggers.add('somenodeid', { noop: utils.noop });
      expect(triggers.authorized.noop[0]).to.equal('somenodeid');
      expect(triggers.behaviors['somenodeid:noop']).to.equal(utils.noop);
    });

    it('should add the behavior for all the identities', function() {
      const triggers = new Triggers();
      triggers.add(['node1', 'node2', 'node1'], { noop: utils.noop });
      expect(triggers.authorized.noop[0]).to.equal('node1');
      expect(triggers.authorized.noop[1]).to.equal('node2');
      expect(triggers.behaviors['node1:noop']).to.equal(utils.noop);
      expect(triggers.behaviors['node2:noop']).to.equal(utils.noop);
    });

  });

  describe('#remove', function() {

    it('should remove the behavior for the identity', function() {
      const triggers = new Triggers();
      triggers.add('somenodeid', { noop: utils.noop });
      triggers.remove('somenodeid', 'noop');
      triggers.remove('someothernode', 'noop'); // Should just do nothing
      triggers.remove('someothernode', 'behavior'); // Should just do nothing
      expect(triggers.authorized.noop[0]).to.equal(undefined);
      expect(triggers.behaviors['somenodeid:noop']).to.equal(undefined);
    });

    it('should remove the behavior for all the identities', function() {
      const triggers = new Triggers();
      triggers.add(['node1', 'node2'], { noop: utils.noop });
      triggers.remove(['node1', 'node2'], 'noop');
      expect(triggers.authorized.noop[0]).to.equal(undefined);
      expect(triggers.behaviors['node1:noop']).to.equal(undefined);
      expect(triggers.authorized.noop[1]).to.equal(undefined);
      expect(triggers.behaviors['node2:noop']).to.equal(undefined);
    });

    it('should remove the all the behavior for all identities', function() {
      const triggers = new Triggers();
      triggers.add(['node1', 'node2'], {
        noop1: utils.noop,
        noop2: utils.noop
      });
      triggers.remove(['node1', 'node2'], ['noop1', 'noop2']);
      expect(triggers.authorized.noop1[0]).to.equal(undefined);
      expect(triggers.behaviors['node1:noop1']).to.equal(undefined);
      expect(triggers.behaviors['node1:noop2']).to.equal(undefined);
      expect(triggers.authorized.noop1[1]).to.equal(undefined);
      expect(triggers.behaviors['node2:noop1']).to.equal(undefined);
      expect(triggers.behaviors['node2:noop2']).to.equal(undefined);
    });

  });

  describe('#process', function() {

    it('should fail if not defined', function(done) {
      const triggers = new Triggers();
      triggers.process({
        behavior: 'test',
        contact: ['nodeid', {}]
      }, function(err) {
        expect(err.message).to.equal('No trigger handler defined for behavior');
        done();
      });
    });

    it('should fail if not authorized', function(done) {
      const triggers = new Triggers();
      triggers.add('notnodeid', { test: utils.noop });
      triggers.process({
        behavior: 'test',
        contact: ['nodeid', {}]
      }, function(err) {
        expect(err.message).to.equal('Not authorized to process trigger');
        done();
      });
    });

    it('should succeed if authorized and defined', function(done) {
      const triggers = new Triggers();
      triggers.add('nodeid', {
        test: function(params, replyToSender, destroyTrigger) {
          destroyTrigger();
          replyToSender(null, { test: 'test' });
        }
      });
      triggers.process({
        behavior: 'test',
        contact: ['nodeid', {}]
      }, function(err, result) {
        expect(result.test).to.equal('test');
        expect(triggers.authorized.test[0]).to.equal(undefined);
        expect(triggers.behaviors['nodeid:test']).to.equal(undefined);
        done();
      });
    });

  });

});
