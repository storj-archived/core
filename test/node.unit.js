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
          setImmediate(() => descriptors.forEach((d) => {
            handler([d, [d.farmer_id, { xpub: d.farmer_hd_key }]]);
          }));
        }
      );
      node.subscribeShardDescriptor(['topic1', 'topic2'], (err, stream) => {
        let count = 0;
        expect(err).to.equal(null);
        expect(quasarSubscribe.callCount).to.equal(1);
        stream.on('data', () => {
          count++;
          if (count >= 2) {
            done();
          }
        });
      });
    });

  });

  describe('@method offerShardAllocation', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should callback error if peer returns one', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        new Error('Failed')
      );
      node.offerShardAllocation(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('OFFER', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback error if descriptor invalid', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
        data_size: 'invalid size'
      });
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        contract.toObject()
      );
      node.offerShardAllocation(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('OFFER', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal(
          'Peer replied with invalid or incomplete contract'
        );
        done();
      });
    });

    it('should callback error if descriptor not complete', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
        data_hash: utils.rmd160sha256(Buffer.from('test')).toString('hex'),
        data_size: 'invalid size'
      });
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        contract.toObject()
      );
      node.offerShardAllocation(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('OFFER', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal(
          'Peer replied with invalid or incomplete contract'
        );
        done();
      });
    });

    it('should store the completed contract and callback', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        [contract.toObject()]
      );
      node.offerShardAllocation(peer, contract.toObject(), (err, result) => {
        expect(err).to.equal(undefined);
        expect(send.calledWithMatch('OFFER', [
          contract.toObject()
        ])).to.equal(true);
        expect(result).to.be.instanceOf(Contract);
        done();
      });
    });

  });

  describe('@method requestContractRenewal', function() {

    const sandbox = sinon.sandbox.create();

    after(() => {
      sandbox.restore();
    });

    it('should callback error if peer returns one', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        new Error('Failed')
      );
      node.requestContractRenewal(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('RENEW', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback error if descriptor invalid', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
        data_size: 'invalid size'
      });
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        [contract.toObject()]
      );
      node.requestContractRenewal(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('RENEW', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal(
          'Peer replied with invalid or incomplete contract'
        );
        done();
      });
    });

    it('should callback error if descriptor not complete', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
        data_hash: utils.rmd160sha256(Buffer.from('test')).toString('hex'),
        data_size: 'invalid size'
      });
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        [contract.toObject()]
      );
      node.requestContractRenewal(peer, contract.toObject(), (err) => {
        expect(send.calledWithMatch('RENEW', [
          contract.toObject()
        ])).to.equal(true);
        expect(err.message).to.equal(
          'Peer replied with invalid or incomplete contract'
        );
        done();
      });
    });

    it('should store the completed contract and callback', function(done) {
      const node = createNode({});
      const peer = ['identity', { xpub: 'xpub' }];
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
      const send = sandbox.stub(node, 'send').callsArgWith(
        3,
        null,
        [contract.toObject()]
      );
      node.requestContractRenewal(peer, contract.toObject(), (err, result) => {
        expect(send.calledWithMatch('RENEW', [
          contract.toObject()
        ])).to.equal(true);
        expect(result).to.be.instanceOf(Contract);
        done();
      });
    });

  });

  describe('@method subscribeCapacityAnnouncement', function() {

    const sandbox = sinon.sandbox.create();

    after(() => sandbox.restore());

    it('should callback with capacity stream', function(done) {
      const node = createNode({});
      const codes = ['01010101'];
      const quasarSubscribe = sandbox.stub(node, 'quasarSubscribe', (c, h) => {
        h([4096, ['identity', { xpub: 'xpubkey' }]]);
      });
      node.subscribeCapacityAnnouncement(codes, (err, stream) => {
        expect(quasarSubscribe.args[0][0][0]).to.equal('0c01010101');
        expect(stream.read()[0]).to.equal(4096);
        done();
      });
    });

  });

  describe('@method publishCapacityAnnouncement', function() {

    const sandbox = sinon.sandbox.create();

    after(() => sandbox.restore());

    it('should enable claims and publish bytes available', function(done) {
      const node = createNode({});
      const quasarPublish = sandbox.stub(node, 'quasarPublish').callsArg(2);
      node.publishCapacityAnnouncement('01010101', 4096, () => {
        expect(node.claims).to.equal(true);
        expect(quasarPublish.args[0][0]).to.equal('0c01010101');
        expect(quasarPublish.args[0][1][0]).to.equal(4096);
        expect(quasarPublish.args[0][1][1][0]).to.equal(
          node.identity.toString('hex')
        );
        done();
      });
    });

  });

});
