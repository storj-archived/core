'use strict';

var assert = require('assert');
var utils = require('../utils');
var Contract = require('../contract');
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

RenterInterface.DEFAULTS = {

};

/**
 * Look up the storage contract by the hash to find the node who has
 * the shard. Look up the appropriate challenge and send it to the node
 * for verification. If successful, invalidate the challenge and pass,
 * otherwise, invalidate the contract.
 * @param {String} hash - RIPEMD-160 SHA-256 hash of the file to audit
 * @param {Function} callback - Called with validity information
 */
RenterInterface.prototype.audit = function(hash, callback) {
  var self = this;

  self._manager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    // TODO: Be smarter about which contract holder we choose if there is more
    // TODO: than a single farmer holding our shard.
    // TODO: Also, if one farmer fails to respond, we should try another
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
 * @param {String} hash - RIPEMD-160 SHA-256 hash of the file to retrieve
 * @param {Function} callback - Called with an error or the file buffer
 */
RenterInterface.prototype.retrieve = function(hash, callback) {
  var self = this;

  self._manager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    // TODO: Be smarter about which contract holder we choose if there is more
    // TODO: than a single farmer holding our shard.
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
 * @deprecated Since v0.6.4 - TODO: Explain alternative solution
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
    audit_count: 12 // TODO: Make this configurable
  }, {
    // TODO: Make criteria configurable
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
 * @param {Contract} contract
 */
RenterInterface.prototype._publishContract = function(contract) {
  assert(contract instanceof Contract, 'Invalid contract supplied');
  return this.publish(contract.getTopicString(), contract.toObject());
};

module.exports = RenterInterface;
