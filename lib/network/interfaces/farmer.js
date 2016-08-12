'use strict';

var async = require('async');
var path = require('path');
var kad = require('kad');
var Network = require('..');
var inherits = require('util').inherits;
var StorageItem = require('../../storage/item');
var Contract = require('../../contract');
var merge = require('merge');
var constants = require('../../constants');
var Manager = require('../../storage/manager');
var LevelDBStorageAdapter = require('../../storage/adapters/level');
var utils = require('../../utils');
var os = require('os');

/**
 * Creates and a new farmer interface
 * @constructor
 * @license AGPL-3.0
 * @extends {Network}
 * @param {Object}   options
 * @param {Object}   options.storage
 * @param {String}   options.storage.path - File system path to store data
 * @param {Number}   options.storage.size - Storage size to allocate
 * @param {String}   options.storage.unit - Storage size unit (MB|GB|TB)
 * @param {Object}   options.payment
 * @param {String}   options.payment.address - Optional payment address
 * @param {Array}    options.opcodes - Optional contract opcodes to farm
 * @param {Function} options.backend - Optional levelup backend db
 * @param {Number}   options.concurrency - Max contracts to offer at a time
 * @param {FarmerInterface~negotiator} options.negotiator - Negotiation rules
 */
function FarmerInterface(options) {
  if (!(this instanceof FarmerInterface)) {
    return new FarmerInterface(options);
  }

  options = merge.recursive(Object.create(FarmerInterface.DEFAULTS), options);
  options.manager = new Manager(
    LevelDBStorageAdapter(
      path.join(options.storage.path, 'farmer.db'),
      options.backend
    ), {
    maxCapacity: utils.toNumberBytes(options.storage.size, options.storage.unit)
  });

  this._hasFreeSpace = true;
  this._negotiator = options.negotiator;
  this._pendingOffers = [];
  this._subscribed = [];

  Network.call(this, options);
  this._listenForCapacityChanges(options.manager);
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

  // NB: Only bid on contracts for data we don't have
  this._manager.load(contract.get('data_hash'), function(err, item) {
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
  storage: {
    path: path.join(os.tmpdir(), 'storj-farmer'),
    size: 5,
    unit: 'MB'
  },
  payment: {
    address: ''
  },
  opcodes: ['0f01020202', '0f02020202', '0f03020202'],
  negotiator: FarmerInterface.Negotiator,
  concurrency: constants.MAX_CONCURRENT_OFFERS
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

    self._listenForContracts(self._options.opcodes);
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
      contact: self._contact
    }
  });

  self._logger.debug('Sending offer for contract');

  self._transport.send(contact, message, function(err, response) {
    self._removeContractFromPendingList(contract);

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
  return this._options.payment.address || this._keypair.getAddress();
};

/**
 * Handles a received contract and negotiates storage
 * @private
 * @param {Contract} contract
 */
FarmerInterface.prototype._negotiateContract = function(contract) {
  var self = this;

  contract.set('farmer_id', self._keypair.getNodeID());
  contract.set('payment_destination', self.getPaymentAddress());
  contract.sign('farmer', self._keypair.getPrivateKey());

  var item = new StorageItem({ hash: contract.get('data_hash') });
  var renterId = contract.get('renter_id');

  item.contracts[renterId] = contract.toObject();
  item.meta[renterId] = {};

  self._manager.save(item, function(err) {
    if (err) {
      self._removeContractFromPendingList(contract);
      return self._logger.error(err.message);
    }

    if (self._router.getContactByNodeID(renterId)) {
      return self._sendOfferForContract(
        contract,
        self._router.getContactByNodeID(renterId)
      );
    }

    self._router.findNode(renterId, function(err, nodes) {
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
  var conOffer = (pendingOffersLength < this._options.concurrency);

  this._logger.debug(
    'pending offers %s is less than concurrency %s: %s',
    pendingOffersLength,
    conOffer,
    this._options.concurrency
  );

  this._negotiator.call(this, contract, function(shouldNegotiate) {
    self._logger.debug('negotiator returned: %s', shouldNegotiate);
    self._logger.debug('we have enough free space: %s', self._hasFreeSpace);

    callback(
      (self._pendingOffers.length < self._options.concurrency) &&
      shouldNegotiate && self._hasFreeSpace
    );
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

  self._manager.load(contract.get('data_hash'), function(err, item) {
    if (err) {
      item = new StorageItem({ hash: contract.get('data_hash') });
    }

    item.contracts[renter.nodeID] = contract.toObject();
    item.meta[renter.nodeID] = {};

    self._manager.save(item, function() {});
  });
};

/**
 * Subscribes to a contract identifier on the network
 * @private
 * @param {Array} opcodes
 */
FarmerInterface.prototype._listenForContracts = function(opcodes) {
  var self = this;

  async.eachSeries(opcodes.filter(function(opcode) {
    return self._subscribed.indexOf(opcode) === -1;
  }), function(opcode, next) {
    self.subscribe(opcode, self._handleContractPublication.bind(self));
    setTimeout(next, constants.SUBSCRIBE_THROTTLE);
  });

  self._subscribed = self._subscribed.concat(opcodes);
};

/**
 * Updates the internal tracker of free space
 * @private
 * @param {Manager} manager - The storage manager passed to the interface
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
