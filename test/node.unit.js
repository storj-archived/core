'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const levelup = require('levelup');
const memdown = require('memdown');
const { KademliaNode } = require('kad');
const Node = require('../lib/node');


function createNode(opts) {
  const node = new Node({
    storage: levelup('dht', { db: memdown }),
    contracts: levelup('contracts', { db: memdown }),
    shards: opts.shards
  });
  return node;
}

describe('@class Node', function() {

  describe('@constructor', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should plugin spartacus and quasar and server', function(done) {
      const plugin = sandbox.spy(Node.prototype, 'plugin');
      const node = createNode({});
      const serverUpload = sandbox.stub(node.server, 'upload');
      const serverDownload = sandbox.stub(node.server, 'download');
      expect(node).to.be.instanceOf(Node);
      expect(plugin.callCount).to.equal(2);
      node.transport.emit('download');
      node.transport.emit('upload');
      setImmediate(() => {
        expect(serverDownload.called).to.equal(true);
        expect(serverUpload.called).to.equal(true);
        done();
      });
    });

  });

  describe('@method listen', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should mount the protocol handlers and bind network', function() {
      const use = sinon.spy(Node.prototype, 'use');
      const listen = sandbox.stub(KademliaNode.prototype, 'listen');
      const node = createNode({});
      node.listen(0);
      expect(use.calledWithMatch('OFFER')).to.equal(true);
      expect(use.calledWithMatch('AUDIT')).to.equal(true);
      expect(use.calledWithMatch('CONSIGN')).to.equal(true);
      expect(use.calledWithMatch('MIRROR')).to.equal(true);
      expect(use.calledWithMatch('RETRIEVE')).to.equal(true);
      expect(use.calledWithMatch('PROBE')).to.equal(true);
      expect(use.calledWithMatch('TRIGGER')).to.equal(true);
      expect(use.calledWithMatch('RENEW')).to.equal(true);
      expect(listen.called).to.equal(true);
    });

  });

  describe('@method authorizeRetrieval', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should send a RETRIEVE RPC to the peer', function(done) {
      const node = createNode({});
      const send = sandbox.stub(node, 'send').callsArg(3);
      const peer = ['identity', { xpub: 'xpub' }];
      const hashes = ['one', 'two', 'three'];
      node.authorizeRetrieval(peer, hashes, () => {
        expect(send.calledWithMatch('RETRIEVE', hashes, peer)).to.equal(true);
        done();
      });
    });

  });

  describe('@method authorizeConsignment', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should send a CONSIGN RPC to the peer', function(done) {
      const node = createNode({});
      const send = sandbox.stub(node, 'send').callsArg(3);
      const peer = ['identity', { xpub: 'xpub' }];
      const hashes = ['one', 'two', 'three'];
      node.authorizeConsignment(peer, hashes, () => {
        expect(send.calledWithMatch('CONSIGN', hashes, peer)).to.equal(true);
        done();
      });
    });

  });

  describe('@method createShardMirror', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should send a MIRROR RPC to the peer', function(done) {
      const node = createNode({});
      const send = sandbox.stub(node, 'send').callsArg(3);
      const source = ['identity', { xpub: 'xpub' }];
      const target = {
        hash: 'hash',
        token: 'token',
        destination: ['identity', { xpub: 'xpub' }]
      };
      node.createShardMirror(source, target, () => {
        expect(send.calledWithMatch('MIRROR', [
          target.hash,
          target.token,
          target.destination
        ], source)).to.equal(true);
        done();
      });
    });

  });

  describe('@method auditRemoteShards', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should send a AUDIT RPC to the peer', function(done) {
      const node = createNode({});
      const send = sandbox.stub(node, 'send').callsArg(3);
      const peer = ['identity', { xpub: 'xpub' }];
      const audits = [
        { hash: 'one', challenge: 'foo' },
        { hash: 'two', challenge: 'bar' },
        { hash: 'three', challenge: 'baz' }
      ];
      node.auditRemoteShards(peer, audits, () => {
        expect(send.calledWithMatch('AUDIT', audits, peer)).to.equal(true);
        done();
      });
    });

  });

  describe('@method publishShardDescriptor', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should send a perform a publish of the descriptor', function(done) {
      const node = createNode({});
      const quasarPublish = sandbox.stub(node, 'quasarPublish').callsArg(3);
      const
      node.publishShardDescriptor(descriptor, {}, () => {

        done();
      });
    });

  });

  describe('@method subscribeShardDescriptor', function() {



  });

  describe('@method offerShardAllocation', function() {



  });

  describe('@method requestContractRenewal', function() {



  });

});
