'use strict';

var assert = require('assert');
var Contract = require('../contract');
var Contact = require('./contact');
var AuditStream = require('../audit-tools/audit-stream');
var kad = require('kad');
var Network = require('./');
var inherits = require('util').inherits;
var StorageItem = require('../storage/item');
var async = require('async');
var OfferStream = require('../contract/offer-stream');

/**
 * Creates and a new renter interface
 * @constructor
 * @license AGPL-3.0
 * @extends {Network}
 * @param {Object}  options
 * @param {String} [options.hdKey] - Extended key at 'group index' as per SIP32
 * @param {Number} [options.hdIndex] - Derivation index for hdKey
 * @param {KeyPair}[options.keyPair] - Node's cryptographic identity
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {String}  options.bridgeUri - URL for bridge server seed lookup
 * @param {Object}  options.logger - Logger instance
 * @param {Array}   options.seedList - List of seed URIs to join
 * @param {String}  options.rpcAddress - Public node IP or hostname
 * @param {Number}  options.rpcPort - Listening port for RPC
 * @param {Boolean} options.doNotTraverseNat - Skip NAT traversal strategies
 * @param {Number}  options.maxTunnels - Max number of tunnels to provide
 * @param {Number}  options.tunnelServerPort - Port for tunnel server to use
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  options.tunnelGatewayRange.min - Min port for gateway bind
 * @param {Number}  options.tunnelGatewayRange.max - Max port for gateway bind
 * @param {Object}  options.rateLimiterOpts - Options for {@link RateLimiter}
 * @param {Object} [options.joinRetry]
 * @param {Number} [options.joinRetry.times] - Times to retry joining net
 * @param {Number} [options.joinRetry.interval] - MS to wait before retrying
 * @emits Network#ready
 * @property {KeyPair} keyPair
 * @property {StorageManager} storageManager
 * @property {kad.Node} node - The underlying DHT node
 * @property {TriggerManager} triggerManager
 * @property {BridgeClient} bridgeClient
 * @property {Contact} contact
 * @property {Transport} transportAdapter
 * @property {kad.Router} router - The underlying DHT router
 * @property {DataChannelServer} dataChannelServer
 */
function RenterInterface(options) {
  if (!(this instanceof RenterInterface)) {
    return new RenterInterface(options);
  }

  Network.call(this, options);
}

inherits(RenterInterface, Network);

/**
 * Creates a readable stream of offers for the storage contract
 * @param {Contract} contract - The storage contract to publish
 * @param {Object} [offerStreamOptions] - Options passed to {@link OfferStream}
 * @returns {OfferStream} offerStream
 */
RenterInterface.prototype.getOfferStream = function(contract, options) {
  assert(contract instanceof Contract, 'Invalid contract supplied');

  var hash = contract.get('data_hash');
  var offerStream = new OfferStream(contract, options);

  this.offerManager.addStream(offerStream);
  this.publish(contract.getTopicString(), contract.toObject(), { key: hash });

  return offerStream;
};

/**
 * Issues an audit request to the given farmer for the data and returns the
 * {@link ProofStream#getProofResult} structure for verification.
 * @param {Contact} farmer - Farmer contact from which proof is needed
 * @param {StorageItem} item - The storage item on which to perform the audit
 * @param {RenterInterface~getStorageProofCallback} callback - Proof handler
 */
RenterInterface.prototype.getStorageProof = function(farmer, item, callback) {
  assert(farmer instanceof Contact, 'Invalid contact supplied');
  assert(item instanceof StorageItem, 'Invalid storage item supplied');

  if (!item.challenges[farmer.nodeID]) {
    return callback(new Error('Item has no contracts with supplied farmer'));
  }

  if (!item.challenges[farmer.nodeID].challenges.length) {
    return callback(new Error('There are no remaining challenges to send'));
  }

  var message = new kad.Message({
    method: 'AUDIT',
    params: {
      audits: [
        {
          data_hash: item.hash,
          challenge: item.challenges[farmer.nodeID].challenges.shift()
        }
      ],
      contact: this.contact
    }
  });

  this.transport.send(farmer, message, function(err, response) {
    if (err) {
      return callback(err);
    }

    if (response.error) {
      return callback(new Error(response.error.message));
    }

    if (!Array.isArray(response.result.proofs)) {
      return callback(new Error('Invalid proof returned'));
    }

    callback(null, response.result.proofs[0]);
  });
};
/**
 * This callback is called upon receipt of an audit proof from
 * {@link RenterInterface#getStorageProof}
 * @callback RenterInterface~getStorageProofCallback
 * @param {Error|null} err - If requesting the proof failed, an error object
 * @param {Array} proof - Result from {@link ProofStream#getProofResult}
 */

/**
 * Requests a consignment pointer from the given farmer for opening a
 * {@link DataChannelClient} for transferring the the data shard to the farmer
 * @param {Contact} farmer - The farmer contact object for requesting token
 * @param {Contract} contract - The storage contract for this consignment
 * @param {AuditStream} audit - The audit object for merkle leaves
 * @param {RenterInterface~getConsignmentPointerCallback} callback
 */
RenterInterface.prototype.getConsignmentPointer = function(f, c, a, callback) {
  var farmer = f;
  var contract = c;
  var audit = a;

  assert(farmer instanceof Contact, 'Invalid farmer contact supplied');
  assert(contract instanceof Contract, 'Invalid contract supplied');
  assert(audit instanceof AuditStream, 'Invalid audit object supplied');

  var message = new kad.Message({
    method: 'CONSIGN',
    params: {
      data_hash: contract.get('data_hash'),
      audit_tree: audit.getPublicRecord(),
      contact: this.contact
    }
  });

  this.transport.send(farmer, message, function(err, response) {
    if (err) {
      return callback(err);
    }

    if (response.error) {
      return callback(new Error(response.error.message));
    }

    callback(null, {
      farmer: f,
      hash: contract.get('data_hash'),
      token: response.result.token,
      operation: 'PUSH'
    });
  });
};
/**
 * This callback is called upon receipt of a consignment token from
 * {@link RenterInterface#getConsignmentPointer}
 * @callback RenterInterface~getConsignmentPointerCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {Object} pointer
 * @param {Contact} pointer.farmer
 * @param {String} pointer.hash
 * @param {String} pointer.token
 * @param {String} pointer.operation
 */

/**
 * Requests a retrieval token from the given farmer for opening a
 * {@link DataChannelClient} for transferring the data shard from the farmer
 * @param {Contact} farmer - The farmer contact object for requesting token
 * @param {Contract} contract - The storage contract for this consignment
 * @param {RenterInterface~getRetrievalPointerCallback} callback - Token handler
 */
RenterInterface.prototype.getRetrievalPointer = function(f, c, callback) {
  var farmer = f;
  var contract = c;

  assert(farmer instanceof Contact, 'Invalid farmer contact supplied');
  assert(contract instanceof Contract, 'Invalid contract supplied');

  var message = new kad.Message({
    method: 'RETRIEVE',
    params: {
      data_hash: contract.get('data_hash'),
      contact: this.contact
    }
  });

  this.transport.send(farmer, message, function(err, response) {
    if (err) {
      return callback(err);
    }

    if (response.error) {
      return callback(new Error(response.error.message));
    }

    callback(null, {
      farmer: f,
      hash: contract.get('data_hash'),
      token: response.result.token,
      operation: 'PULL'
    });
  });
};
/**
 * This callback is called upon receipt of a retrieval token from
 * {@link RenterInterface#getRetrieveToken}
 * @callback RenterInterface~getRetrievalPointerCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {Object} pointer
 * @param {Contact} pointer.farmer
 * @param {String} pointer.hash
 * @param {String} pointer.token
 * @param {String} pointer.operation
 */

/**
 * Requests that the given destination farmers mirror the data from the sources
 * @param {Array.<Object>} sources - Pointers for each destination
 * @param {Array.<Contact>} destinations - The farmers to replicate to
 * @param {RenterInterface~getMirrorNodesCallback} callback - Results handler
 */
RenterInterface.prototype.getMirrorNodes = function(sources, dests, callback) {
  var self = this;

  assert(Array.isArray(sources), 'Invalid sources list supplied');
  assert(Array.isArray(dests), 'Invalid destination list supplied');
  assert(
    sources.length === dests.length,
    'Sources and destinations must have equal length'
  );

  dests.forEach(function(dest) {
    assert(dest instanceof Contact, 'Invalid destination supplied');
  });

  function _sendMirrorRequest(destination, next) {
    var source = sources.shift();
    var message = new kad.Message({
      method: 'MIRROR',
      params: {
        data_hash: source.hash,
        token: source.token,
        farmer: source.farmer,
        contact: self.contact
      }
     });

    self.transport.send(destination, message, function(err, response) {
      if (err || !response || response.error) {
        return next(null, false);
      }
      next(null, true);
    });
  }

  function _onMirrorRequestsComplete(err, results) {
    // Error is never passed in the filter, as the test is for an error
    // we can keep the error check here anyways, if the code changes.
    /* istanbul ignore next */
    if (err) {
      return callback(err);
    }
    if (results.length === 0) {
      return callback(new Error('All mirror requests failed'));
    }

    callback(null, results);
  }

  async.filter(dests, _sendMirrorRequest, _onMirrorRequestsComplete);
};
/**
 * This callback is called upon acknowledgement of a mirror request
 * @callback RenterInterface~getMirrorNodesCallback
 * @param {Error|null} err - If requesting all mirrors failed, an error object
 * @param {Array.<Contact>} results - The farmers who successfully mirrored
 */

module.exports = RenterInterface;
