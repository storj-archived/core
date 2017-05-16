'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const levelup = require('levelup');
const memdown = require('memdown');
const { KademliaNode } = require('kad');
const { utils: keyutils } = require('kad-spartacus');
const utils = require('../lib/utils');
const Contract = require('../lib/contract');
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

    it('should callback error if publication fails', function(done) {
      const node = createNode({});
      const quasarPublish = sandbox.stub(node, 'quasarPublish')
                             .callsArgWith(3, new Error('Failed'));
      const shard = Buffer.from('shard');
      const renterHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const descriptor = new Contract({
        renter_id: keyutils.toPublicKeyHash(renterHdKey.publicKey)
                     .toString('hex'),
        renter_hd_key: renterHdKey.publicExtendedKey,
        renter_hd_index: 1,
        payment_destination: '14WNyp8paus83JoDvv2SowKb3j1cZBhJoV',
        data_hash: utils.rmd160sha256(shard).toString('hex'),
        data_size: shard.length
      });
      descriptor.sign('renter', renterHdKey.privateKey);
      node.publishShardDescriptor(descriptor.toObject(), (err) => {
        expect(quasarPublish.called).to.equal(true);
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should send a perform a publish of the descriptor', function(done) {
      const node = createNode({});
      const quasarPublish = sandbox.stub(node, 'quasarPublish').callsArg(3);
      const shard = Buffer.from('shard');
      const renterHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const descriptor = new Contract({
        renter_id: keyutils.toPublicKeyHash(renterHdKey.publicKey)
                     .toString('hex'),
        renter_hd_key: renterHdKey.publicExtendedKey,
        renter_hd_index: 1,
        payment_destination: '14WNyp8paus83JoDvv2SowKb3j1cZBhJoV',
        data_hash: utils.rmd160sha256(shard).toString('hex'),
        data_size: shard.length
      });
      descriptor.sign('renter', renterHdKey.privateKey);
      node.publishShardDescriptor(descriptor.toObject(), () => {
        expect(quasarPublish.called).to.equal(true);
        expect(node.offers.size).to.equal(1);
        node.offers.get(descriptor.get('data_hash')).emit('end');
        setImmediate(() => {
          expect(node.offers.size).to.equal(0);
          done();
        });
      });
    });

  });

  describe('@method subscribeShardDescriptor', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should push valid descriptors through the stream', function(done) {
      const node = createNode({});
      const renterHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const farmerHdKey = keyutils.toHDKeyFromSeed().deriveChild(1);
      const contract = new Contract({
        renter_id: keyutils.toPublicKeyHash(renterHdKey.publicKey)
                     .toString('hex'),
        farmer_id: keyutils.toPublicKeyHash(farmerHdKey.publicKey)
                     .toString('hex'),
        renter_hd_key: renterHdKey.publicExtendedKey,
        farmer_hd_key: farmerHdKey.publicExtendedKey,
        renter_hd_index: 1,
        farmer_hd_index: 1,
        payment_destination: '14WNyp8paus83JoDvv2SowKb3j1cZBhJoV',
        data_hash: utils.rmd160sha256(Buffer.from('test')).toString('hex'),
        data_size: Buffer.from('test').length
      });
      contract.sign('renter', renterHdKey.privateKey);
      contract.sign('farmer', farmerHdKey.privateKey);
      const descriptors = [
        {
          renter_id: 'invalid id'
        },
        contract.toObject(),
        contract.toObject()
      ];
      const quasarSubscribe = sandbox.stub(
        node,
        'quasarSubscribe',
        function(codes, handler) {
          setImmediate(() => descriptors.forEach((d) => handler(d)));
        }
      );
      node.subscribeShardDescriptor(['topic1', 'topic2'], (err, stream) => {
        let count = 0;
        expect(err).to.equal(null);
        stream.on('data', (desc) => {
          count++;
          if (count >= 2) {
            done();
          }
        });
      });
    });

  });

  describe('@method offerShardAllocation', function() {



  });

  describe('@method requestContractRenewal', function() {



  });

});
