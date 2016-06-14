'use strict';

var assert = require('assert');
var utils = require('../utils');
var ProofStream = require('../proofstream');
var Contract = require('../contract');
var StorageItem = require('../storage/item');
var stream = require('readable-stream');
var kad = require('kad');
var async = require('async');
var Contact =  require('./contact');
var constants = require('../constants');

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
  this._logger = this._network._logger;
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

  this._logger.info(
    'handling storage contract offer from %s', params.contact.nodeID
  );

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
      Contact(params.contact),
      contract
    );
    delete self._network._pendingContracts[key];

    var item = new StorageItem({ hash: key });

    item.contracts[params.contact.nodeID] = contract;

    self._network._manager.save(item, function(err) {
      if (err) {
        return callback(err);
      }

      self._logger.info(
        'accepting storage contract offer from %s', params.contact.nodeID
      );

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
  if (!contract.verify('farmer', contact.nodeID)) {
    return callback(new Error('Invalid signature from farmer'));
  }

  contract.sign('renter', this._network._keypair.getPrivateKey());

  if (!contract.isComplete()) {
    return callback(new Error('Contract is not complete'));
  }

  if (!this._network._pendingContracts[contract.get('data_hash')]) {
    this._network.emit('unhandledOffer', contract, contact);
    return callback(new Error('Contract no longer open to offers'));
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
  var limit = constants.MAX_CONCURRENT_AUDITS;

  if (!Array.isArray(params.audits)) {
    return callback(new Error('Invalid audit list supplied'));
  }

  this._logger.info(
    'handling storage audit from %s', params.contact.nodeID
  );

  async.mapLimit(params.audits, limit, function(audit, done) {
    self._proveShardExistence(
      audit.data_hash,
      audit.challenge,
      params.contact.nodeID,
      done
    );
  }, function onComplete(err, proofs) {
    if (err) {
      return callback(err);
    }

    callback(null, { proofs: proofs });
  });
};

/**
 * Performs a single audit proof generation
 * @private
 * @param {String} hash - The hash of the shard to prove
 * @param {String} challenge - The challenge input for proof generation
 * @param {String} nodeID - The nodeID of the auditor
 * @param {Function} callback - Called on completion of the proof generation
 */
Protocol.prototype._proveShardExistence = function(hash, chall, nid, cb) {
  if (!hash || !chall) {
    return cb(new Error('Invalid data hash or challenge provided'));
  }

  this._network._manager.load(hash, function(err, item) {
    if (err) {
      return cb(err);
    }

    if (item.shard instanceof stream.Writable) {
      return cb(new Error('Shard not found'));
    }

    var proof = new ProofStream(item.trees[nid], chall);

    item.shard.pipe(proof).on('finish', function() {
      cb(null, proof.getProofResult());
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

  this._logger.info(
    'handling storage consignment request from %s', params.contact.nodeID
  );

  self._network._manager.load(params.data_hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var contract = item.contracts[params.contact.nodeID];
    var t = Date.now();
    item.trees[contract.get('renter_id')] = params.audit_tree;

    try {
      assert(
        t < contract.get('store_end') && t > contract.get('store_begin'),
        'Consignment violates contract store time'
      );
    } catch (err) {
      return callback(err);
    }

    self._network._manager.save(item, function(err) {
      if (err) {
        return callback(err);
      }

      self._logger.info(
        'authorizing data channel for %s', params.contact.nodeID
      );

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

    self._logger.info(
      'authorizing data channel for %s', params.contact.nodeID
    );

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

  this._logger.info('performing probe for %s', params.contact.nodeID);
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
  var knownTunnelers = this._network._tunnelers.getContactList();
  var tunnels = available ?
                [this._network._contact].concat(knownTunnelers) :
                knownTunnelers;

  this._logger.info('finding tunnels for %s', params.contact.nodeID);

  if (tunnels.length) {
    this._logger.info(
      'sending %s tunnels to %s', tunnels.length, params.contact.nodeID
    );
    return callback(null, { tunnels: tunnels });
  }

  if (params.relayers.length < constants.MAX_FIND_TUNNEL_RELAYS) {
    return this._askNeighborsForTunnels(params.relayers, callback);
  }

  callback(null, { tunnels: tunnels });
};

/**
 * Sends a FIND_TUNNEL to our seed on behalf of requester
 * @private
 */
Protocol.prototype._askNeighborsForTunnels = function(relayers, callback) {
  var self = this;
  var nearestNeighbors = this._network._router.getNearestContacts(
    this._network._contact.nodeID,
    3,
    this._network._contact.nodeID
  ).filter(function(contact) {
    return relayers.indexOf(contact.nodeID) === -1;
  });

  this._logger.info('asking nearest neighbors for known tunnels');

  function askNeighbor(neighbor, done) {
    self._network._transport.send(neighbor, kad.Message({
      method: 'FIND_TUNNEL',
      params: {
        contact: self._network._contact,
        relayers: [self._network.contact].concat(relayers)
      }
    }), function(err, response) {
      if (err || !Array.isArray(response.result.tunnels)) {
        return done(null, false);
      }

      if (response.result.tunnels && response.result.tunnels.length) {
        response.result.tunnels.forEach(function(tun) {
          if (self._network._tunnelers.getSize() < kad.constants.K) {
            self._network._tunnelers.addContact(
              self._network._transport._createContact(tun)
            );
          }
        });
        return done(null, true);
      }

      done(null, false);
    });
  }

  async.detectSeries(nearestNeighbors, askNeighbor, function() {
    callback(null, { tunnels: self._network._tunnelers.getContactList() });
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

  this._logger.info('opening gateway for %s', params.contact.nodeID);
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

    var alias = {
      address: self._network._contact.address,
      port: gateway.getEntranceAddress().port
    };

    self._logger.info(
      'gateway opened for %s at %j', params.contact.nodeID, alias
    );

    if (!self._network._transport._requiresTraversal) {
      return callback(null, { tunnel: tunnel, alias: alias });
    }

    self._network._transport.createPortMapping(
      gateway.getEntranceAddress().port,
      function(err) {
        if (err) {
          return callback(err);
        }

        callback(null, { tunnel: tunnel, alias: alias });
      }
    );
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
