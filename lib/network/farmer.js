'use strict';

var fs = require('fs');
var path = require('path');
var kad = require('kad');
var Network = require('./');
var inherits = require('util').inherits;
var StorageItem = require('../storage/item');
var Contract = require('../contract');
var merge = require('merge');
var constants = require('../constants');
var utils = require('../utils');

/**
 * Creates and a new farmer interface
 * @constructor
 * @license AGPL-3.0
 * @extends {Network}
 * @param {Object} options
 * @param {String} options.paymentAddress - Optional payment address
 * @param {Array} options.opcodeSubscriptions - Contract opcodes to farm
 * @param {Number} options.maxOfferConcurrency - Max offers to have pending
 * @param {FarmerInterface~negotiator} options.contractNegotiator
 * @param {KeyPair} options.keyPair - Node's cryptographic identity
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {String} options.bridgeUri - URL for bridge server seed lookup
 * @param {Object} options.logger - Logger instance
 * @param {Array} options.seedList - List of seed URIs to join
 * @param {String} options.rpcAddress - Public node IP or hostname
 * @param {Number} options.rpcPort - Listening port for RPC
 * @param {Boolean} options.doNotTraverseNat - Skip NAT traversal strategies
 * @param {Number} options.maxTunnels - Max number of tunnels to provide
 * @param {Number} options.tunnelServerPort - Port for tunnel server to use
 * @param {Object} options.tunnelGatewayRange
 * @param {Number} options.tunnelGatewayRange.min - Min port for gateway binding
 * @param {Number} options.tunnelGatewayRange.max - Max port for gateway binding
 * @param {Number} [options.offerBackoffLimit=4] - Do not send offers if more
 * than N transfers are active
 * @param {String[]} [options.renterWhitelist] - Node IDs to offer storage to
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
function FarmerInterface(options) {
  if (!(this instanceof FarmerInterface)) {
    return new FarmerInterface(options);
  }

  options = merge.recursive(Object.create(FarmerInterface.DEFAULTS), options);

  this._hasFreeSpace = true;
  this._negotiator = options.contractNegotiator;
  this._pendingOffers = [];
  this._offerBackoffLimit = options.offerBackoffLimit;
  this._renterWhitelist = Array.isArray(options.renterWhitelist) ?
                          options.renterWhitelist :
                          null;

  Network.call(this, options);
  this._listenForCapacityChanges(options.storageManager);
}

inherits(FarmerInterface, Network);

/**
 * Called when a contract is found that meets subscription criteria and allows
 * us to modify the contract terms if we desire and then uses the return value
 * to determine if we should send the renter an offer
 * @callback FarmerInterface~negotiator
 * @param {Contract} contract - The contract object to negotiate
 * @returns {Boolean}
 */

FarmerInterface.Negotiator = function(contract, callback) {
  var self = this;

  if (this._renterWhitelist) {
    var allowed =  {
      renterNodeId: this._renterWhitelist.indexOf(
        contract.get('renter_id')
      ) !== -1,
      renterExtendedPubKey: this._renterWhitelist.indexOf(
        contract.get('renter_hd_key')
      ) !== -1
    };
    var isWhitelisted = allowed.renterNodeId || allowed.renterExtendedPubKey;

    self._logger.debug('renter is whitelisted: %s', isWhitelisted);

    if (!isWhitelisted) {
      return callback(false);
    }
  }

  if (!contract.get('data_hash')) {
    self._logger.warn('contract received with invalid data_hash, ignoring');
    return callback(false);
  }

  // NB: Backoff on sending offers if we are already have high active transfer
  if (self.transport.shardServer.activeTransfers >= self._offerBackoffLimit) {
    self._logger.warn('too many active transfers, not sending offer');
    return callback(false);
  }

  // NB: Only bid on contracts for data we don't have
  this.storageManager.load(contract.get('data_hash'), function(err, item) {
    if (err) {
      self._logger.debug('no storage item available for this shard');
      return callback(true);
    }

    var renters = Object.keys(item.contracts);

    if (renters.indexOf(contract.get('renter_id')) === -1) {
      self._logger.debug('no contract currently staged for this shard');
      return callback(true);
    }

    if (typeof item.shard.write === 'function') {
      self._logger.debug('no data currently stored for this shard');
      return callback(true);
    }

    callback(false);
  });
};

FarmerInterface.DEFAULTS = {
  renterWhitelist: fs.readFileSync(
    path.join(__dirname, '../../TRUSTED_KEYS')
  ).toString().split('\n').filter((k) => !!k),
  paymentAddress: '',
  opcodeSubscriptions: ['0f01020202', '0f02020202', '0f03020202'],
  contractNegotiator: FarmerInterface.Negotiator,
  maxOfferConcurrency: constants.MAX_CONCURRENT_OFFERS,
  offerBackoffLimit: 4
};

/**
 * Wraps the super call to {@link Network#join} to listen for contract after
 * successfully establishing a connection to the network
 * @param {Function} callback - Called on successful join
 */
FarmerInterface.prototype.join = function(callback) {
  var self = this;

  Network.prototype.join.call(this, function(err) {
    if (err) {
      return callback(err);
    }

    self._listenForContracts(self._options.opcodeSubscriptions);
    self.on(
      'connected',
      self._listenForContracts.bind(self, self._options.opcodeSubscriptions)
    );
    callback();
  });
};

/**
 * Sends the given contract as an offer to the specified renter
 * @private
 * @param {Contract} contract - The contract to include in offer
 * @param {Contact} renter - The renter who originally published the contract
 */
FarmerInterface.prototype._sendOfferForContract = function(contract, contact) {
  var self = this;
  var message = new kad.Message({
    method: 'OFFER',
    params: {
      contract: contract.toObject(),
      contact: self.contact
    }
  });

  self._logger.debug('Sending offer for contract');
  self._removeContractFromPendingList(contract);
  self.transport.send(contact, message, function(err, response) {
    if (err) {
      return self._logger.warn(err.message);
    }

    if (response.error || !response.result.contract) {
      return self._logger.warn(
        response.error ? response.error.message : 'Renter refused to sign'
      );
    }

    self._handleOfferRes(response, contract, contact);
  });
};

/**
 * Returns the payment address supplied or the derived one from keypair
 * @returns {String}
 */
FarmerInterface.prototype.getPaymentAddress = function() {
  return this._options.paymentAddress || this.keyPair.getAddress();
};

/**
 * Handles a received contract and negotiates storage
 * @private
 * @param {Contract} contract
 */
FarmerInterface.prototype._negotiateContract = function(contract) {
  var self = this;

  contract.set('farmer_id', self.keyPair.getNodeID());
  contract.set('payment_destination', self.getPaymentAddress());
  contract.sign('farmer', self.keyPair.getPrivateKey());

  var item = new StorageItem({ hash: contract.get('data_hash') });
  var renterId = contract.get('renter_id');
  var lookupOpts = { aggressiveCache: true };

  if (typeof renterId !== 'string') {
    self._removeContractFromPendingList(contract);
    return self._logger.warn('dropping invalid contract with no renter id');
  }

  item.addContract({ nodeID: renterId }, contract);
  item.addMetaData({ nodeID: renterId }, {});

  self.storageManager.save(item, function(err) {
    if (err) {
      self._removeContractFromPendingList(contract);
      return self._logger.error(err.message);
    }

    if (self.router.getContactByNodeID(renterId)) {
      return self._sendOfferForContract(
        contract,
        self.router.getContactByNodeID(renterId)
      );
    }

    self.router.findNode(renterId, lookupOpts, function(err, nodes) {
      if (err) {
        self._removeContractFromPendingList(contract);
        return self._logger.error(err.message);
      }

      var renter = nodes.filter(function(node) {
        return node.nodeID === renterId;
      })[0];

      if (!renter) {
        self._removeContractFromPendingList(contract);
        return self._logger.warn('could not locate renter for offer');
      }

      self._sendOfferForContract(contract, renter);
    });
  });
};

/**
 * Checks if we should send an offer by checking the pending offers and running
 * the optional custom negotiator function
 * @private
 * @param {Contract} contract
 * @param {Function} callback
 */
FarmerInterface.prototype._shouldSendOffer = function(contract, callback) {
  var self = this;
  var pendingOffersLength = this._pendingOffers.length;
  var conOffer = (pendingOffersLength < this._options.maxOfferConcurrency);

  this._logger.debug(
    'pending offers %s is less than concurrency %s: %s',
    pendingOffersLength,
    conOffer,
    this._options.maxOfferConcurrency
  );

  this._negotiator.call(this, contract, function(shouldNegotiate) {
    self._logger.debug('negotiator returned: %s', shouldNegotiate);
    self._logger.debug('we have enough free space: %s', self._hasFreeSpace);
    self.storageManager._storage.size(function(err, usedSpace) {
      if (err) {
        self._logger.error('Could not get usedSpace: %s',err.message);
        return callback(false);
      }

      var freeSpace = self.storageManager._options.maxCapacity - usedSpace;

      callback(
        (self._pendingOffers.length < self._options.maxOfferConcurrency) &&
        shouldNegotiate && self._hasFreeSpace &&
        (contract.get('data_size') <= freeSpace)
      );
    });
  });
};

/**
 * Adds the contract data hash to the pending offers list
 * @private
 * @param {Contract} contract - The contract being negotiated
 */
FarmerInterface.prototype._addContractToPendingList = function(contract) {
  var id = contract.get('data_hash') + contract.get('renter_id');

  if (this._pendingOffers.indexOf(id) !== -1) {
    return 0;
  }

  return this._pendingOffers.push(id);
};

/**
 * Removes the contract data hash to the pending offers list
 * @param {Contract} contract - The contract being negotiated
 * @private
 */
FarmerInterface.prototype._removeContractFromPendingList = function(contract) {
  var index = this._pendingOffers.indexOf(
    contract.get('data_hash') + contract.get('renter_id')
  );

  if (index === -1) {
    return;
  }

  this._pendingOffers.splice(index, 1);
};

/**
 * Handles an offer response from a renter
 * @private
 */
FarmerInterface.prototype._handleOfferRes = function(res, contract, renter) {
  var self = this;
  var final = null;

  try {
    final = Contract.fromObject(res.result.contract);
  } catch (err) {
    return self._logger.warn('renter responded with invalid contract');
  }

  if (!final.verify('renter', contract.get('renter_id'))) {
    return self._logger.warn('renter signature is invalid');
  }

  self.storageManager.load(contract.get('data_hash'), function(err, item) {
    if (err) {
      item = new StorageItem({ hash: contract.get('data_hash') });
    }

    item.addContract(renter, contract);
    item.addMetaData(renter, {});
    self.storageManager.save(item, utils.noop);
  });
};

/**
 * Subscribes to a contract identifier on the network
 * @private
 * @param {Array} opcodes
 */
FarmerInterface.prototype._listenForContracts = function(opcodes) {
  this.subscribe(opcodes, this._handleContractPublication.bind(this));
};

/**
 * Updates the internal tracker of free space
 * @private
 * @param {StorageManager} manager - The storage manager passed to the interface
 */
FarmerInterface.prototype._listenForCapacityChanges = function(manager) {
  var self = this;

  manager.on('locked', function() {
    self._hasFreeSpace = false;
  });

  manager.on('unlocked', function() {
    self._hasFreeSpace = true;
  });

  manager.on('error', function(err) {
    self._logger.warn('error in storage manager: %s', err.message);
  });
};

/**
 * Handles received contract publications
 * @private
 * @param {Object} contract - The raw contract object
 */
FarmerInterface.prototype._handleContractPublication = function(contract) {
  var self = this;
  var contractObj;

  this._logger.debug('received contract offer...');

  try {
    contractObj = Contract.fromObject(contract);
  } catch (err) {
    return; // If the contract is invalid just drop it
  }

  this._shouldSendOffer(contractObj, function(shouldSendOffer) {
    if (!shouldSendOffer) {
      return self._logger.debug('not sending an offer for the contract');
    }

    self._addContractToPendingList(contractObj);
    self._negotiateContract(contractObj);
  });
};

module.exports = FarmerInterface;
