/**
 * @module storj/network/protocol
 */

'use strict';

var assert = require('assert');
var Shard = require('../shard');
var Proof = require('../proof');
var ShardManager = require('../shard/manager');
var Contract = require('../contract');
var ContractManager = require('../contract/manager');

/**
 * Defines the Storj protocol methods
 * @constructor
 * @param {Object} options
 * @param {ContractManager} options.contracts
 * @param {ShardManager} options.shards
 * @param {Network} options.network
 */
function Protocol(opts) {
  if (!(this instanceof Protocol)) {
    return new Protocol(opts);
  }

  assert(typeof opts === 'object' , 'Invalid options supplied');
  assert(opts.shards instanceof ShardManager, 'Bad shard manager');
  assert(opts.contracts instanceof ContractManager, 'Bad contract manager');

  this._network = opts.network;
  this._contracts = opts.contracts;
  this._shards = opts.shards;
}

/**
 * Handles OFFER messages
 * @private
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype._handleOffer = function(params, contact, callback) {
  var contract;

  try {
    contract = contract.fromObject(params.contract);
  } catch (err) {
    return callback(new Error('Invalid contract format'));
  }

  // TODO: Ultimately we will need to create a robust decision engine that will
  // TODO: allow us to better determine if the received offer is in our best
  // TODO: interest. For now, we just make sure that we have the data_shard
  // TODO: from the OFFER and we wish to CONSIGN it.

  // For now, we just accept any storage offer we get that matches our own...
  var self = this;
  var key = contract.get('data_hash');

  self._contracts.load(key, function(err, localContract) {
    if (err) {
      return callback(err);
    }

    if (!Contract.compare(contract, localContract)) {
      return callback(new Error('Contract does not match terms'));
    }

    if (!contract._complete()) {
      return callback(new Error('Contract is not complete'));
    }

    if (!contract.verify('farmer', contact.nodeID)) {
      return callback(new Error('Invalid signature from farmer'));
    }

    contract.sign('renter', self._network._keypair.getPrivateKey());
    self._contracts.add(contract, callback);
  });
};

/**
 * Handles AUDIT messages
 * @private
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype._handleAudit = function(params, contact, callback) {
  var self = this;

  self._shards.load(params.data_hash, function(err, shard) {
    if (err) {
      return callback(err);
    }

    var buffer = new Buffer(shard.getData(), 'hex');
    var proof = new Proof({ leaves: shard.getTree(), shard: buffer });

    callback(null, { proof: proof.prove(params.challenge) });
  });
};

/**
 * Handles CONSIGN messages
 * @private
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype._handleConsign = function(params, contact, callback) {
  var self = this;

  self._contracts.load(params.data_hash, function(err, contract) {
    if (err) {
      return callback(err);
    }

    var shard = null;
    var t = Date.now();
    var buffer = new Buffer(params.data_shard, 'hex');

    try {
      shard = new Shard(buffer, params.audit_tree);

      assert(
        buffer.length <= contract.get('data_size'),
        'Shard size exceeds the contract'
      );
      assert(
        t < contract.get('store_end') || t > contract.get('store_begin'),
        'Consignment violates contract store time'
      );
      assert(
        shard.getHash() === contract.get('data_hash'),
        'Shard hash does not match contract'
      );
    } catch (err) {
      return callback(err);
    }

    self._shards.add(contract.get('data_hash'), shard, function(err) {
      if (err) {
        return callback(err);
      }

      callback();
    });
  });
};

/**
 * Handles RETRIEVE messages
 * @private
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype._handleRetrieve = function(params, contact, callback) {
  var self = this;
  var hash = params.data_hash;

  // TODO: We will need to increment the download count to track payments, as
  // TODO: well as make sure that the requester is allowed to fetch the shard
  // TODO: as part of the contract.

  self._shards.load(hash, function(err, shard) {
    if (err) {
      return callback(err);
    }

    callback(null, { data_shard: shard.getData() });
  });
};

/**
 * Returns bound references to the protocol handlers
 */
Protocol.prototype.handlers = function() {
  return {
    OFFER: this._handleOffer.bind(this),
    AUDIT: this._handleAudit.bind(this),
    CONSIGN: this._handleConsign.bind(this),
    RETRIEVE: this._handleRetrieve.bind(this)
  };
};

module.exports = Protocol;
