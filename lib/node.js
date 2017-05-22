'use strict';

const { Readable: ReadableStream } = require('stream');
const { createLogger } = require('bunyan');
const merge = require('merge');
const { KademliaNode } = require('kad');
const quasar = require('kad-quasar');
const spartacus = require('kad-spartacus');

const Contract = require('./contract');
const OfferStream = require('./offers');
const Triggers = require('./triggers');
const Rules = require('./rules');
const Server = require('./server');
const Transport = require('./transport');


/**
 * Extends Kademlia with Storj protocol rules
 * @license AGPL-3.0
 */
class Node extends KademliaNode {

  static get DEFAULTS() {
    return {
      logger: createLogger({ name: 'storj' }),
      transport: new Transport(),
      privateExtendedKey: null,
      keyDerivationIndex: 1,
      contracts: null,
      shards: null
    };
  }

  /**
   * @constructor
   * @extends {KademliaNode}
   * @param {object} options
   * @param {string} options.privateExtendedKey - HD extended private key
   * @param {object} [options.logger] - Bunyan compatible logger
   * @param {object} [options.transport] - Storj transport adapter
   * @param {object} options.contracts - Levelup compatible contract store
   * @param {object} options.shards - KFS compatible shard database
   * @param {number} [options.keyDerivationIndex] - HD derivation index
   */
  constructor(options) {
    const opts = merge(Node.DEFAULTS, options);

    super(merge(Node.DEFAULTS, options));

    this.quasar = this.plugin(quasar);
    this.spartacus = this.plugin(spartacus(options.privateExtendedKey,
                                           options.keyDerivationIndex));
    this.offers = new Map();
    this.contracts = opts.contracts;
    this.shards = opts.shards;
    this.server = new Server({
      contracts: this.contracts,
      shards: this.shards,
      identity: this.identity
    });
    this.triggers = new Triggers();

    this.transport.on('download',
                      (req, res) => this.server.download(req, res));
    this.transport.on('upload',
                      (req, res) => this.server.upload(req, res));
  }

  /**
   * Adds the kademlia rule handlers before calling super#listen()
   */
  listen() {
    let handlers = new Rules(this);

    this.use('OFFER', handlers.offer.bind(handlers));
    this.use('AUDIT', handlers.audit.bind(handlers));
    this.use('CONSIGN', handlers.consign.bind(handlers));
    this.use('MIRROR', handlers.mirror.bind(handlers));
    this.use('RETRIEVE', handlers.retrieve.bind(handlers));
    this.use('PROBE', handlers.probe.bind(handlers));
    this.use('TRIGGER', handlers.trigger.bind(handlers));
    this.use('RENEW', handlers.renew.bind(handlers));

    super.listen(...arguments);
  }

  /**
   * Requests authorization tokens to pull file shard(s) from another node
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {string|object} peer.1 - Address data for contact
   * @param {string[]} hashes - Hashes of the shards to pull
   * @param {Node~authorizeRetrievalCallback} callback
   */
  authorizeRetrieval(peer, hashes, callback) {
    this.send('RETRIEVE', hashes, peer, callback);
  }
  /**
   * @callback Node~authorizeRetrievalCallback
   * @param {error|null} error
   * @param {string[]} retrievalTokens
   */

  /**
   * Requests authorization tokens to push file shard(s) to another node
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {string|object} peer.1 - Address data for contact
   * @param {string[]} hashes - Hashes of the shards to push
   * @param {Node~authorizeConsignmentCallback} callback
   */
  authorizeConsignment(peer, hashes, callback) {
    this.send('CONSIGN', hashes, peer, callback);
  }
  /**
   * @callback Node~authorizeConsignmentCallback
   * @param {error|null} error
   * @param {string[]} consignmentTokens
   */

  /**
   * Requests the source node to MIRROR a shard to the supplied destination
   * @param {array} source
   * @param {string} source.0 - Identity key string
   * @param {string|object} source.1 - Address data for contact
   * @param {object} target
   * @param {array} target.destination -
   * @param {string} target.destination.0 - Identity key string
   * @param {string|object} target.destination.1 - Address data for contact
   * @param {string} target.hash - Hash of the shard to mirror
   * @param {string} target.token - Authorization token to PUSH shard
   * @param {Node~createShardMirrorCallback} callback
   */
  createShardMirror(source, target, callback) {
    this.send('MIRROR', [target.hash, target.token, target.destination],
              source, callback);
  }
  /**
   * @callback Node~createShardMirrorCallback
   * @param {object|null} error
   */

  /**
   * Sends the series of hash/challenge pairs to the remote node to request
   * proof-of-storage
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {string|object} peer.1 - Address data for contact
   * @param {object[]} audits
   * @param {string} audits.hash - Hash of the shard to prove
   * @param {string} audits.challenge - Challenge string to prepend to shard
   * @param {Node~auditRemoteShardsCallback} callback
   */
  auditRemoteShards(peer, audits, callback) {
    this.send('AUDIT', audits, peer, callback);
  }
  /**
   * @callback Node~auditRemoteShardsCallback
   * @param {object|null} error
   * @param {object[]} proofs
   * @param {string} proofs.hash - Hash of the shard for corresponding proof
   * @param {string} proofs.proof - {@tutorial compact-merkle-proof}
   */

  /**
   * Publishes a storage contract proposal to the network and exposes a stream
   * of received OFFER messages
   * @param {object} contract - See {@tutorial storage-contracts} for format
   * @param {object} [offerStreamOptions] - See {@link OfferStream}
   * @param {Node~publishShardDescriptorCallback} callback
   */
  publishShardDescriptor(contract, options, callback) {
    contract = Contract.from(contract);

    /* istanbul ignore else */
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const routingKey = contract.get('data_hash');
    const topicString = contract.getTopicString();
    const offerStream = new OfferStream(contract, options);
    const descriptor = contract.toObject();

    ['end', 'error', 'destroy'].forEach((event) => {
      offerStream.on(event, () => this.offers.delete(routingKey));
    });

    this.offers.set(routingKey, offerStream);
    this.quasarPublish(topicString, descriptor, { routingKey }, (err) => {
      if (err) {
        return callback(err);
      }

      callback(null, offerStream);
    });
  }
  /**
   * @callback Node~publishShardDescriptorCallback
   * @param {error|null} error
   * @param {OfferStream} offerStream - Readable stream of OFFER messages
   */

  /**
   * Subscribes to the supplied shard descriptor topics and executes the user
   * and exposes a stream of incoming shard descriptor messages
   * @param {string[]} descriptorCodes - See {@tutorial storage-contracts}
   * @param {Node~subscribeShardDescriptorCallback} callback
   */
  subscribeShardDescriptor(descriptorCodes, callback) {
    const descriptorStream = new ReadableStream({
      read: () => null,
      objectMode: true
    });

    this.quasarSubscribe(descriptorCodes, (descriptor) => {
      descriptor = Contract.from(descriptor);

      if (descriptor.isValid()) {
        descriptorStream.push(descriptor);
      }
    });

    callback(null, descriptorStream);
  }
  /**
   * @callback Node~subscribeShardDescriptorCallback
   * @param {error|null} error
   * @param {DescriptorStream} descriptorStream - Readable stream of incoming
   * shard descriptors
   */

  /**
   * Offers a peer an allocation for the storage of a given shard
   * descriptor-turned-contract, see {@tutorial storage-contracts} for details
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {string|object} peer.1 - Address data for contact
   * @param {object} contract - The completed shard descriptor contract
   * @param {Node~offerShardAllocationCallback} callback
   */
  offerShardAllocation(peer, descriptor, callback) {
    this.send('OFFER', [descriptor], peer, (err, result) => {
      if (err) {
        return callback(err);
      }

      const contract = Contract.from(result[0]);
      const hash = contract.get('data_hash');
      const [, { xpub }] = peer;
      const key = `${hash}:${xpub}`;

      if (!(contract.isValid() && contract.isComplete())) {
        return callback(new Error(
          'Peer replied with invalid or incomplete contract'
        ));
      }

      this.contracts.put(key, result[0], (err) => callback(err, contract));
    });
  }
  /**
   * @callback Node~offerShardAllocationCallback
   * @param {error|null} error
   * @param {object} contract - See {@tutorial storage-contracts}
   */

  /**
   * Requests that the target peer update their local version of the given
   * contract. Used to extend storage time or terminate storage. Peer will
   * respond with an error or their updated, signed record of the renewal.
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {object} peer.1 - Address data for contact
   * @param {object} contract - The completed shard descriptor contract
   * @param {Node~requestContractRenewalCallback} callback
   */
  requestContractRenewal(peer, descriptor, callback) {
    this.send('RENEW', [descriptor], peer, (err, result) => {
      if (err) {
        return callback(err);
      }

      const contract = Contract.from(result[0]);
      const hash = contract.get('data_hash');
      const [, { xpub }] = peer;
      const key = `${hash}:${xpub}`;

      if (!(contract.isValid() && contract.isComplete())) {
        return callback(new Error(
          'Peer replied with invalid or incomplete contract'
        ));
      }

      this.contracts.put(key, result, (err) => callback(err, contract));
    });
  }
  /**
   * @callback Node~requestContractRenewalCallback
   * @param {error|null} error
   * @param {object} contract - See {@tutorial storage-contracts}
   */

}

module.exports = Node;
