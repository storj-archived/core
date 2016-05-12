'use strict';

var path = require('path');
var kad = require('kad');
var Network = require('../network');
var inherits = require('util').inherits;
var StorageItem = require('../storage/item');
var Contract = require('../contract');
var merge = require('merge');
var Manager = require('../manager');
var LevelDBStorageAdapter = require('../storage/adapters/level');

/**
 * Creates and a new farmer interface
 * @constructor
 * @extends {Network}
 * @param {Object}   options
 * @param {Object}   options.storage
 * @param {String}   options.storage.path - File system path to store data
 * @param {Number}   options.storage.size - Storage size to allocate
 * @param {String}   options.storage.unit - Storage size unit (MB|GB|TB)
 * @param {Array}    options.opcodes - Optional contract opcodes to farm
 * @param {Function} options.backend - Optional levelup backend db
 * @param {FarmerInterface~negotiator} options.negotiator - Negotiation rules
 */
function FarmerInterface(options) {
  if (!(this instanceof FarmerInterface)) {
    return new FarmerInterface(options);
  }

  // TODO: Handle storage.size and storage.unit
  options = merge(Object.create(FarmerInterface.DEFAULTS), options);
  options.manager = new Manager(new LevelDBStorageAdapter(
    path.join(options.storage.path, 'farmer.db'),
    options.backend
  ));

  this._negotiator = options.negotiator;

  Network.call(this, options);
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

FarmerInterface.DEFAULTS = {
  storage: {
    path: '/tmp/storj-farmer',
    size: 5,
    unit: 'MB'
  },
  opcodes: ['0f01020202', '0f02020202', '0f03020202'],
  negotiator: function(/* contract */) {
    return true;
  }
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
 * Handles a received contract and negotiates storage
 * @private
 * @param {Contract} contract
 * @returns {Boolean}
 */
FarmerInterface.prototype._negotiateContract = function(contract) {
  var self = this;

  if (!this._negotiator(contract)) {
    return false;
  }

  contract.set('farmer_id', self._keypair.getNodeID());
  contract.set('payment_destination', self._keypair.getAddress());
  contract.sign('farmer', self._keypair.getPrivateKey());

  var item = new StorageItem({ hash: contract.get('data_hash') });
  var renterId = contract.get('renter_id');

  item.contracts[renterId] = contract.toObject();
  item.meta[renterId] = {};

  self._manager.save(item, function(err) {
    if (err) {
      return self._logger.error(err.message);
    }

    self._router.findNode(renterId, function(err, nodes) {
      if (err) {
        return self._logger.error(err.message);
      }

      var renter = nodes.filter(function(node) {
        return node.nodeID === renterId;
      })[0];

      if (!renter) {
        return self._logger.error('Could not locate renter for offer');
      }

      var message = new kad.Message({
        method: 'OFFER',
        params: {
          contract: contract.toObject(),
          contact: self._contact
        }
      });

      self._transport.send(renter, message, function(err, response) {
        if (err) {
          return self._logger.error(err.message);
        }

        if (response.error || !response.result.contract) {
          return self._logger.error(
            response.error ? response.error.message : 'Renter refused to sign'
          );
        }

        self._handleOfferRes(response, contract, renter);
      });
    });
  });

  return true;
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
    return self._logger.error('Renter responded with invalid contract');
  }

  if (!final.verify('renter', contract.get('renter_id'))) {
    return self._logger.error('Renter signature is invalid');
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

  opcodes.forEach(function(opcode) {
    self.subscribe(opcode, function(contract) {
      var contractObj;

      try {
        contractObj = Contract.fromObject(contract);
      } catch (err) {
        return false; // If the contract is invalid just drop it
      }

      self._negotiateContract(contractObj);
    });
  });
};

module.exports = FarmerInterface;
