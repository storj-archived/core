'use strict';

var assert = require('assert');
var utils = require('../utils');
var Contract = require('../contract');
var Contact = require('../network/contact');
var Audit = require('../audit');
var kad = require('kad');
var Network = require('../network');
var inherits = require('util').inherits;
var StorageItem = require('../storage/item');
var Verification = require('../verification');
var DataChannelClient = require('../datachannel/client');

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

  this.publish(contract.getTopicString(), contract.toObject());
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
 * {@link Proof#prove} structure for verification.
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
      data_hash: item.hash,
      challenge: item.challenges[farmer.nodeID].challenges.shift(),
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

    if (!Array.isArray(response.result.proof)) {
      return callback(new Error('Invalid proof returned'));
    }

    callback(null, response.result.proof);
  });
};
/**
 * This callback is called upon receipt of an audit proof from
 * {@link RenterInterface#getStorageProof}
 * @callback RenterInterface~getStorageProofCallback
 * @param {Error|null} err - If requesting the proof failed, an error object
 * @param {Array} proof - Challenge response from {@link Proof#prove}
 */

/**
 * Requests a consignment token from the given farmer for opening a
 * {@link DataChannelClient} for transferring the the data shard to the farmer
 * @param {Contact} farmer - The farmer contact object for requesting token
 * @param {Contract} contract - The storage contract for this consignment
 * @param {Audit} audit - The audit object for generating merkle leaves
 * @param {RenterInterface~getConsignTokenCallback} callback - Token handler
 */
RenterInterface.prototype.getConsignToken = function(f, c, a, callback) {
  var farmer = f;
  var contract = c;
  var audit = a;

  assert(farmer instanceof Contact, 'Invalid farmer contact supplied');
  assert(contract instanceof Contract, 'Invalid contract supplied');
  assert(audit instanceof Audit, 'Invalid audit object supplied');

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

    callback(null, response.result.token);
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
 * @param {RenterInterface~getRetrieveTokenCallback} callback - Token handler
 */
RenterInterface.prototype.getRetrieveToken = function(f, c, callback) {
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

    callback(null, response.result.token);
  });
};
/**
 * This callback is called upon receipt of a retrieval token from
 * {@link RenterInterface#getRetrieveToken}
 * @callback RenterInterface~getRetrieveTokenCallback
 * @param {Error|null} err - If requesting the token failed, an error object
 * @param {String} token - Consignment token for a {@link DataChannelClient}
 */

/*                                                                            *\
** +------------------------------------------------------------------------+ **
** |                  THE FOLLOWING METHODS ARE DEPRECATED                  | **
** |                   THEY REMAIN ONLY FOR COMPATIBILITY                   | **
** +------------------------------------------------------------------------+ **
\*                                                                            */

/**
 * Look up the storage contract by the hash to find the node who has
 * the shard. Look up the appropriate challenge and send it to the node
 * for verification. If successful, invalidate the challenge and pass,
 * otherwise, invalidate the contract.
 * @deprecated Since v0.6.8 - Use {@link RenterInterface#getStorageProof} and
 * verify the prove with the {@link Verification} class.
 * @param {String} hash - RIPEMD-160 SHA-256 hash of the file to audit
 * @param {Function} callback - Called with validity information
 */
RenterInterface.prototype.audit = function(hash, callback) {
  var self = this;

  self._manager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var farmerID = Object.keys(item.contracts)[0];

    self._router.findNode(farmerID, function(err, nodes) {
      if (err) {
        return callback(err);
      }

      var farmer = nodes.filter(function(node) {
        return node.nodeID === farmerID;
      })[0];

      if (!farmer) {
        return callback(new Error('Could not find the farmer'));
      }

      var audit = item.challenges[farmer.nodeID];
      var message = new kad.Message({
        method: 'AUDIT',
        params: {
          data_hash: hash,
          challenge: audit.challenges[0],
          contact: self._contact
        }
      });

      self._transport.send(farmer, message, function(err, response) {
        if (err) {
          return callback(err);
        }

        if (response.error) {
          return callback(new Error(response.error.message));
        }

        if (!response.result.proof) {
          return callback(new Error('Invalid proof returned'));
        }

        var verification = new Verification(response.result.proof);

        callback(null, verification.verify(audit.root, audit.depth));
      });
    });
  });
};

/**
 * Look up the storage contract by the hash to find the node who has
 * the shard, then execute a RETRIEVE RPC to the node and return the
 * data as a buffer.
 * @deprecated Since v0.6.8 - Use {@link RenterInterface#getRetrieveToken} to
 * authorize the transfer and use the {@link DataChannelClient} class to
 * perform the transfer.
 * @param {String} hash - RIPEMD-160 SHA-256 hash of the file to retrieve
 * @param {Function} callback - Called with an error or the file buffer
 */
RenterInterface.prototype.retrieve = function(hash, callback) {
  var self = this;

  self._manager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var farmerID = Object.keys(item.contracts)[0];

    self._router.findNode(farmerID, function(err, nodes) {
      if (err) {
        return callback(err);
      }

      var farmer = nodes.filter(function(node) {
        return node.nodeID === farmerID;
      })[0];

      if (!farmer) {
        return callback(new Error('Could not find the farmer'));
      }

      var message = new kad.Message({
        method: 'RETRIEVE',
        params: { data_hash: hash, contact: self._contact }
      });

      self._transport.send(farmer, message, function(err, response) {
        if (err) {
          return callback(err);
        }

        if (response.error) {
          return callback(new Error(response.error.message));
        }

        var token = response.result.token;
        var channel = new DataChannelClient(response.result.contact);

        channel.on('open', function() {
          callback(null, channel.retrieve(token, hash));
        });
      });
    });
  });
};

/**
 * Create a contract from the data and options supplied and publish it
 * on the network. Keep track of the pending contract until it becomes
 * fulfilled by an OFFER, then issue a CONSIGN RPC to the offerer and
 * callback when the data is stored.
 * @deprecated Since v0.6.4 - Use {@link RenterInterface#getStorageOffer} to
 * solicit the network for storage, then use the
 * {@link RenterInterface#getConsignToken} method to authorize the transfer,
 * finally using a {@link DataChannelClient} to send the shards.
 * @param {Buffer} data - Raw binary blob to store
 * @param {Number} duration - Time in milliseconds for storage contract
 * @param {Function} callback - Called on successful store
 */
RenterInterface.prototype.store = function(data, duration, callback) {
  assert(Buffer.isBuffer(data), 'Invalid data supplied');
  assert(typeof duration === 'number', 'Invalid duration supplied');
  assert(typeof callback === 'function', 'Callback is not a function');

  var self = this;
  var shardHash = utils.rmd160sha256(data);
  var contract = new Contract({
    renter_id: this._keypair.getNodeID(),
    data_size: data.length,
    data_hash: shardHash,
    store_begin: Date.now(),
    store_end: Date.now() + duration,
    audit_count: 12
  });
  var audit = new Audit({ audits: 12, shard: data });

  // Store a reference to this contract as a function to issue a CONSIGN
  this._pendingContracts[shardHash] = function(farmer) {
    var message = new kad.Message({
      method: 'CONSIGN',
      params: {
        data_hash: contract.get('data_hash'),
        audit_tree: audit.getPublicRecord(),
        contact: self._contact
      }
    });

    self._transport.send(farmer, message, function(err, response) {
      if (err) {
        return callback(err);
      }

      if (response.error) {
        return callback(new Error(response.error.message));
      }

      var token = response.result.token;
      var channel = new DataChannelClient(response.result.contact);

      channel.on('open', function() {
        channel.consign(token, data, function(err, hash) {
          if (err) {
            return callback(err);
          }

          self._manager.load(shardHash, function(err, item) {
            if (err) {
              item = new StorageItem({ hash: shardHash });
            }

            item.trees[farmer.nodeID] = audit.getPublicRecord();
            item.challenges[farmer.nodeID] = audit.getPrivateRecord();
            item.meta[farmer.nodeID] = {};

            self._manager.save(item, function(err) {
              if (err) {
                return callback(err);
              }

              callback(null, hash);
            });
          });
        });
      });
    });
  };

  self._publishContract(contract);
};

/**
 * Publishes a contract to the network
 * @private
 * @deprecated Since v0.6.8 - Replaced by the public method
 * {@link RenterInterface#getStorageOffer}
 * @param {Contract} contract
 */
RenterInterface.prototype._publishContract = function(contract) {
  assert(contract instanceof Contract, 'Invalid contract supplied');
  return this.publish(contract.getTopicString(), contract.toObject());
};

module.exports = RenterInterface;
