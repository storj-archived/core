'use strict';

var assert = require('assert');
var Contract = require('../contract');
var Contact = require('../network/contact');
var AuditStream = require('../auditstream');
var kad = require('kad');
var Network = require('../network');
var inherits = require('util').inherits;
var StorageItem = require('../storage/item');
var async = require('async');
var DataChannelPointer = require('../datachannel/pointer');

/**
 * Creates and a new farmer interface
 * @constructor
 * @extends {Network}
 */
function RenterInterface(options) {
  if (!(this instanceof RenterInterface)) {
    return new RenterInterface(options);
  }

  Network.call(this, options);
}

inherits(RenterInterface, Network);

/**
 * Publishes a storage {@link Contract} for solicitation of offers based on the
 * supplied shard metadata.
 * @param {Contract} contract - Proposed storage contract to solicit for offers
 * @param {RenterInterface~getStorageOfferCallback} callback - Offer handler
 */
RenterInterface.prototype.getStorageOffer = function(contract, callback) {
  assert(contract instanceof Contract, 'Invalid contract supplied');
  assert(typeof callback === 'function', 'Invalid offer handler supplied');

  this._pendingContracts[contract.get('data_hash')] = callback;

  this.publish(contract.getTopicString(), contract.toObject(), {
    key: contract.get('data_hash')
  });
};
/**
 * This callback is called upon receipt of an offer from
 * {@link RenterInterface#getStorageOffer}
 * @callback RenterInterface~getStorageOfferCallback
 * @param {Contact} farmer - The farmer who offered to fulfill the contract
 * @param {Contract} contract - The {@link Contact} offered by the farmer
 */

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
      contact: this._contact
    }
  });

  this._transport.send(farmer, message, function(err, response) {
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
      contact: this._contact
    }
  });

  this._transport.send(farmer, message, function(err, response) {
    if (err) {
      return callback(err);
    }

    if (response.error) {
      return callback(new Error(response.error.message));
    }

    callback(null, DataChannelPointer(
      f,
      contract.get('data_hash'),
      response.result.token,
      'PUSH'
    ));
  });
};
/**
 * This callback is called upon receipt of a consignment token from
 * {@link RenterInterface#getConsignmentPointer}
 * @callback RenterInterface~getConsignmentPointerCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {DataChannelPointer} pointer - Pointer for a {@link DataChannelClient}
 */

/**
 * Requests a consignment token from the given farmer for opening a
 * {@link DataChannelClient} for transferring the the data shard to the farmer
 * @deprecated since version 1.4.0
 * @param {Contact} farmer - The farmer contact object for requesting token
 * @param {Contract} contract - The storage contract for this consignment
 * @param {AuditStream} audit - The audit object for merkle leaves
 * @param {RenterInterface~getConsignTokenCallback} callback
 */
RenterInterface.prototype.getConsignToken = function(f, c, a, callback) {
  this.getConsignmentPointer(f, c, a, function(err, pointer) {
    if (err) {
      return callback(err);
    }

    callback(null, pointer.token);
  });
};
/**
 * This callback is called upon receipt of a consignment token from
 * {@link RenterInterface#getConsignToken}
 * @callback RenterInterface~getConsignTokenCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {String} token - Consignment token for a {@link DataChannelClient}
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
      contact: this._contact
    }
  });

  this._transport.send(farmer, message, function(err, response) {
    if (err) {
      return callback(err);
    }

    if (response.error) {
      return callback(new Error(response.error.message));
    }

    callback(null, DataChannelPointer(
      f,
      contract.get('data_hash'),
      response.result.token,
      'PULL'
    ));
  });
};
/**
 * This callback is called upon receipt of a retrieval token from
 * {@link RenterInterface#getRetrieveToken}
 * @callback RenterInterface~getRetrievalPointerCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {DataChannelPointer} pointer - Pointer for a {@link DataChannelClient}
 */

/**
* Requests a retrieval token from the given farmer for opening a
* {@link DataChannelClient} for transferring the the data shard from the farmer
* @deprecated since version 1.4.0
* @param {Contact} farmer - The farmer contact object for requesting token
* @param {Contract} contract - The storage contract for this retrieval
* @param {RenterInterface~getConsignTokenCallback} callback
*/
RenterInterface.prototype.getRetrieveToken = function(f, c, callback) {
  this.getRetrievalPointer(f, c, function(err, pointer) {
    if (err) {
      return callback(err);
    }

    callback(null, pointer.token);
  });
};
/**
* This callback is called upon receipt of a consignment token from
* {@link RenterInterface#getConsignToken}
* @callback RenterInterface~getConsignTokenCallback
* @param {Error|null} err - If requesting the token failed, an error object
* @param {String} token - Consignment token for a {@link DataChannelClient}
*/

/**
 * Requests that the given destination farmers mirror the data from the source
 * {@link DataChannelPointer}.
 * @param {Array.<DataChannelPointer>} sources - Pointers for each destination
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

  sources.forEach(function(src) {
    assert(src instanceof DataChannelPointer, 'Invalid pointer supplied');
  });

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
        contact: self._contact
      }
     });

    self._transport.send(destination, message, function(err, response) {
      if (err || response.error) {
        return next(false);
      }

      next(true);
    });
  }

  function _onMirrorRequestsComplete(results) {
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
