'use strict';

var assert = require('assert');
var utils = require('../utils');
var Proof = require('../proof');
var Contract = require('../contract');
var StorageItem = require('../storage/item');
var stream = require('stream');
var kad = require('kad');

/**
 * Defines the Storj protocol methods and mounts on a {@link Network} instance
 * to handle Storj protocol messages
 * @constructor
 * @param {Object} options
 * @param {Network} options.network - Network instance to bind to
 */
function Protocol(opts) {
  if (!(this instanceof Protocol)) {
    return new Protocol(opts);
  }

  assert(typeof opts === 'object' , 'Invalid options supplied');

  this._network = opts.network;
}

/**
 * Handles OFFER messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleOffer = function(params, callback) {
  var self = this;
  var contract;

  try {
    contract = Contract.fromObject(params.contract);
  } catch (err) {
    return callback(new Error('Invalid contract format'));
  }

  // TODO: Ultimately we will need to create a robust decision engine that will
  // TODO: allow us to better determine if the received offer is in our best
  // TODO: interest. For now, we just make sure that we have the data_shard
  // TODO: from the OFFER and we wish to CONSIGN it.

  // For now, we just accept any storage offer we get that matches our own...
  var key = contract.get('data_hash');

  this._verifyContract(contract, params.contact, function(err) {
    if (err) {
      return callback(err);
    }

    var doConsign = self._network._pendingContracts[key].bind(
      self._network,
      params.contact
    );
    delete self._network._pendingContracts[key];

    var item = new StorageItem({ hash: key });

    item.contracts[params.contact.nodeID] = contract;

    self._network._manager.save(item, function(err) {
      if (err) {
        return callback(err);
      }

      callback(null, { contract: contract.toObject() });
      doConsign();
    });
  });
};

/**
 * Verifies that the contract is valid
 * @private
 */
Protocol.prototype._verifyContract = function(contract, contact, callback) {
  if (!this._network._pendingContracts[contract.get('data_hash')]) {
    return callback(new Error('Contract no longer open to offers'));
  }

  if (!contract.verify('farmer', contact.nodeID)) {
    return callback(new Error('Invalid signature from farmer'));
  }

  contract.sign('renter', this._network._keypair.getPrivateKey());

  if (!contract._complete()) {
    return callback(new Error('Contract is not complete'));
  }

  callback(null);
};

/**
 * Handles AUDIT messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleAudit = function(params, callback) {
  var self = this;
  var shard = new Buffer([]);

  self._network._manager.load(params.data_hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    if (item.shard instanceof stream.Writable) {
      return callback(new Error('Shard not found'));
    }

    item.shard.on('data', function(chunk) {
      shard = Buffer.concat([shard, chunk]);
    });

    item.shard.on('end', function() {
      var proof = new Proof({
        leaves: item.trees[params.contact.nodeID],
        shard: shard
      });

      callback(null, { proof: proof.prove(params.challenge) });
    });
  });
};

/**
 * Handles CONSIGN messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleConsign = function(params, callback) {
  var self = this;
  var token = utils.generateToken();

  self._network._manager.load(params.data_hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var contract = item.contracts[params.contact.nodeID];
    var t = Date.now();
    item.trees[contract.get('renter_id')] = params.audit_tree;

    try {
      assert(
        t < contract.get('store_end') || t > contract.get('store_begin'),
        'Consignment violates contract store time'
      );
    } catch (err) {
      return callback(err);
    }

    self._network._manager.save(item, function(err) {
      if (err) {
        return callback(err);
      }

      self._network._channel.accept(token, params.data_hash);
      callback(null, { token: token });
    });
  });
};

/**
 * Handles RETRIEVE messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleRetrieve = function(params, callback) {
  var self = this;
  var hash = params.data_hash;
  var token = utils.generateToken();

  // TODO: We will need to increment the download count to track payments, as
  // TODO: well as make sure that the requester is allowed to fetch the shard
  // TODO: as part of the contract.

  self._network._manager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    self._network._channel.accept(token, item.hash);
    callback(null, { token: token });
  });
};

/**
 * Handles PROBE messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleProbe = function(params, callback) {
  var message = new kad.Message({
    method: 'PING',
    params: { contact: this._network._contact }
  });

  this._network._transport.send(params.contact, message, function(err) {
    if (err) {
      return callback(new Error('Probe failed, you are not addressable'));
    }

    callback(null, {});
  });
};

/**
 * Handles FIND_TUNNEL messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleFindTunnel = function(params, callback) {
  var available = this._network._transport._tunserver.hasTunnelAvailable();
  var tunnels = [];

  if (available) {
    tunnels.push(this._network._contact);
  }

  callback(null, {
    tunnels: tunnels.concat(this._network._tunnelers.getContactList())
  });
};

/**
 * Handles OPEN_TUNNEL messages
 * @private
 * @param {Object} params
 * @param {Function} callback
 */
Protocol.prototype._handleOpenTunnel = function(params, callback) {
  var self = this;

  this._network._transport._tunserver.createGateway(function(err, gateway) {
    if (err) {
      return callback(err);
    }

    var tunnel = [
      'ws://',
      self._network._contact.address,
      ':',
      self._network._transport._tunserver.getListeningPort(),
      '/tun?token=',
      gateway.getEntranceToken()
    ].join('');

    callback(null, {
      tunnel: tunnel,
      alias: {
        address: self._network._contact.address,
        port: gateway.getEntranceAddress().port
      }
    });
  });
};

/**
 * Returns bound references to the protocol handlers
 * @returns {Object} handlers
 */
Protocol.prototype.handlers = function() {
  return {
    OFFER: this._handleOffer.bind(this),
    AUDIT: this._handleAudit.bind(this),
    CONSIGN: this._handleConsign.bind(this),
    RETRIEVE: this._handleRetrieve.bind(this),
    PROBE: this._handleProbe.bind(this),
    FIND_TUNNEL: this._handleFindTunnel.bind(this),
    OPEN_TUNNEL: this._handleOpenTunnel.bind(this)
  };
};

module.exports = Protocol;
