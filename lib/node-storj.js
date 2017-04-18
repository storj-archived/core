'use strict';

const { KademliaNode } = require('kad');
const quasar = require('kad-quasar');
const spartacus = require('kad-spartacus');
const traverse = require('kad-traverse');
const StorjRules = require('./rules-storj');


/**
 * Extends Kademlia with Storj protocol rules
 * @license AGPL-3.0
 */
class StorjNode extends KademliaNode {

  /**
   * @constructor
   * @extends {KademliaNode}
   * @param {object} options
   * @param {buffer} [options.ecdsaPrivateKey] - ECDSA private key bytes
   */
  constructor(options) {
    super(options);

    this.plugin(quasar);
    this.plugin(spartacus(options.ecdsaPrivateKey));
    this.plugin(traverse([
      new traverse.UPNPStrategy(),
      new traverse.NATPMPStrategy()
    ]));
  }

  /**
   * Adds the kademlia rule handlers before calling super#listen()
   */
  listen() {
    let handlers = new StorjRules(this);

    this.use('OFFER', handlers.offer.bind(handlers));
    this.use('AUDIT', handlers.audit.bind(handlers));
    this.use('CONSIGN', handlers.consign.bind(handlers));
    this.use('MIRROR', handlers.mirror.bind(handlers));
    this.use('RETRIEVE', handlers.retrieve.bind(handlers));
    this.use('PROBE', handlers.probe.bind(handlers));
    this.use('FIND_TUNNEL', handlers.findTunnel.bind(handlers));
    this.use('OPEN_TUNNEL', handlers.openTunnel.bind(handlers));
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
   * @param {StorjNode~authorizeRetrievalCallback} callback
   */
  authorizeRetrieval(peer, hashes, callback) {

  }
  /**
   * @callback StorjNode~authorizeRetrievalCallback
   * @param {error|null} error
   * @param {string[]} retrievalTokens
   */

  /**
   * Requests authorization tokens to push file shard(s) to another node
   * @param {array} peer
   * @param {string} peer.0 - Identity key string
   * @param {string|object} peer.1 - Address data for contact
   * @param {string[]} hashes - Hashes of the shards to push
   * @param {StorjNode~authorizeConsignmentCallback} callback
   */
  authorizeConsignment(peer, hashes, callback) {

  }
  /**
   * @callback StorjNode~authorizeConsignmentCallback
   * @param {error|null} error
   * @param {string[]} consignmentTokens
   */

  /**
   * Requests the source node to MIRROR a shard to the supplied destinations
   * @param {array} source
   * @param {string} source.0 - Identity key string
   * @param {string|object} source.1 - Address data for contact
   * @param {object} target
   * @param {array} target.destination -
   * @param {string} target.destination.0 - Identity key string
   * @param {string|object} target.destination.1 - Address data for contact
   * @param {string} target.hash - Hash of the shard to mirror
   * @param {string} target.token - Authorization token to PUSH shard
   * @param {StorjNode~createShardMirrorCallback} callback
   */
  createShardMirror(source, target, callback) {

  }
  /**
   * @callback StorjNode~createShardMirrorCallback
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
   * @param {StorjNode~auditRemoteShardsCallback} callback
   */
  auditRemoteShards(peer, audits, callback) {

  }
  /**
   * @callback StorjNode~auditRemoteShardsCallback
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
   * @param {StorjNode~publishShardDescriptorCallback} callback
   */
  publishShardDescriptor(contract, options, callback) {

  }
  /**
   * @callback StorjNode~publishShardDescriptorCallback
   * @param {error|null} error
   * @param {OfferStream} offerStream - Readable stream of OFFER messages
   */

  /**
   * Subscribes to the supplied shard descriptor topics and executes the user
   * and exposes a stream of incoming shard descriptor messages
   * @param {string[]} descriptorCodes - See {@tutorial storage-contracts}
   * @param {StorjNode~subscribeShardDescriptorCallback} callback
   */
  subscribeShardDescriptor(descriptorCodes, callback) {

  }
  /**
   * @callback StorjNode~subscribeShardDescriptorCallback
   * @param {error|null} error
   * @param {DescriptorStream} descriptorStream - Readable stream of incoming
   * shard descriptors
   */

}

module.exports = StorjNode;
