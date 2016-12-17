'use strict';

var through = require('through');
var crypto = require('crypto');
var assert = require('assert');
var utils = require('../utils');
var ProofStream = require('../audit-tools/proof-stream');
var Contract = require('../contract');
var stream = require('readable-stream');
var kad = require('kad');
var async = require('async');
var Contact =  require('./contact');
var constants = require('../constants');
var ExchangeReport = require('../bridge-client/exchange-report');

/**
 * Defines the Storj protocol methods and mounts on a {@link Network} instance
 * to handle Storj protocol messages
 * @constructor
 * @license AGPL-3.0
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

Protocol.RENEW_PROPS_ALLOWED = [
  'renter_id',
  'renter_hd_key',
  'renter_hd_index',
  'renter_signature',
  'store_begin',
  'store_end'
];

/**
 * Handles OFFER messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {Contract} params.contract - Serialized contract data
 * @param {Protocol~handleOfferCallback} callback
 * @fires Network#unhandledOffer
 * @fires Network#unhandledOfferResolved
 */
Protocol.prototype.handleOffer = function(params, callback) {
  var self = this;
  var contract = null;

  this._logger.info(
    'handling storage contract offer from %s', params.contact.nodeID
  );

  try {
    contract = Contract.fromObject(params.contract);
  } catch (err) {
    return callback(new Error('Invalid contract format'));
  }

  var key = contract.get('data_hash');
  var offerStream = self._network.offerManager.getStream(key);

  this._verifyContract(contract, params.contact, function(err) {
    if (err) {
      return callback(err);
    }

    if (offerStream) {
      // NB: We are waiting on/accepting offers for this contract,
      // NB: so add it to the offer queue
      offerStream.addOfferToQueue(Contact(params.contact), contract);
    } else {
      // NB: We are not waiting on/accepting offers for this contract,
      // NB: so notify implementors
      self._network.emit(
        'unhandledOfferResolved',
        Contact(params.contact),
        contract
      );
    }

    callback(null, { contract: contract.toObject() });
  });
};
/**
 * @callback Protocol~handleOfferCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {Contract} result.contract - Signed contract
 */

/**
 * Verifies that the contract is valid
 * @private
 */
Protocol.prototype._verifyContract = function(contract, contact, callback) {
  contract.sign('renter', this._network.keyPair.getPrivateKey());

  if (!contract.isComplete()) {
    return callback(new Error('Contract is not complete'));
  }

  if (!contract.verify('farmer', contact.nodeID)) {
    return callback(new Error('Invalid signature from farmer'));
  }

  var offerStream = this._network.offerManager.getStream(
    contract.get('data_hash')
  );

  if (!offerStream) {
    if (!this._network.listenerCount('unhandledOffer')) {
      return callback(new Error('Contract no longer open to offers'));
    }

    return this._network.emit('unhandledOffer', contact, contract, callback);
  }

  var blacklist = offerStream.options.farmerBlacklist;

  if (blacklist.indexOf(contact.nodeID) !== -1) {
    return callback(new Error('Contract no longer open to offers'));
  }

  callback(null);
};
/**
 * @callback Protocol~unhandledOfferResolver
 * @param {Error} [error] - An error if the offer cannot be resolved
 */

/**
 * Handles AUDIT messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {Object[]} params.audits
 * @param {String} params.audits.data_hash - Shard data hash to audit
 * @param {String} params.audits.challenge - Challenge string for audit
 * @param {Protocol~handleAuditCallback} callback
 */
Protocol.prototype.handleAudit = function(params, callback) {
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
 * @callback Protocol~handleAuditCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {Array[]} result.proofs - Mapped list of proof responses
 */

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

  this._network.storageManager.load(hash, function(err, item) {
    if (err) {
      return cb(err);
    }

    if (item.shard instanceof stream.Writable) {
      return cb(new Error('Shard not found'));
    }

    var proof = new ProofStream(item.trees[nid], chall);

    proof.on('error', function(err) {
      proof.removeAllListeners('finish');
      cb(err);
    });

    proof.on('finish', function() {
      proof.removeAllListeners('error');
      cb(null, proof.getProofResult());
    });

    item.shard.pipe(proof);
  });
};

/**
 * Handles CONSIGN messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {String} params.data_hash - Shard data hash (contract key)
 * @param {String[]} params.audit_tree - Bottom leaves of audit merkle tree
 * @param {Protocol~handleConsignCallback} callback
 */
Protocol.prototype.handleConsign = function(params, callback) {
  var self = this;
  var token = utils.generateToken();

  this._logger.info(
    'handling storage consignment request from %s', params.contact.nodeID
  );

  self._network.storageManager.load(params.data_hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var contract = item.getContract(params.contact);
    var t = Date.now();

    if (!contract) {
      return callback(new Error('Consignment is not authorized'));
    }

    item.trees[contract.get('renter_id')] = params.audit_tree;

    try {
      assert(
        t < contract.get('store_end') &&
        t + constants.CONSIGN_THRESHOLD > contract.get('store_begin'),
        'Consignment violates contract store time'
      );
    } catch (err) {
      return callback(err);
    }

    self._network.storageManager.save(item, function(err) {
      if (err) {
        return callback(err);
      }

      self._logger.info(
        'authorizing data channel for %s', params.contact.nodeID
      );

      self._network.transport.shardServer.accept(
        token,
         params.data_hash,
         params.contact
       );
      callback(null, { token: token });
    });
  });
};
/**
 * @callback Protocol~handleConsignCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {String} result.token - Data channel authorization token
 */

/**
 * Handles MIRROR messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {String} params.data_hash - Shard hash to mirror
 * @param {String} params.token - Data channel authorization token
 * @param {Contact} params.farmer - The farmer to transfer data from
 * @param {Protocol~handleMirrorCallback} callback
 */
Protocol.prototype.handleMirror = function(params, callback) {
  /* jshint maxstatements:16 */
  const self = this;
  const {data_hash: hash, token} = params;
  const bridgeClient = this._network.bridgeClient;

  self._network.storageManager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    // NB: Don't mirror data we are not contracted for
    if (!item.getContract(params.contact)) {
      return callback(new Error('No contract found for shard'));
    }

    // NB: Don't mirror if we already have the shard
    if (typeof item.shard.write !== 'function') {
      return callback(null, {});
    }

    self._logger.info(
      'opening data transfer with %j to mirror %s',
      params.farmer,
      hash
    );

    const hasher256 = crypto.createHash('sha256');
    const report = new ExchangeReport({
      reporterId: self._network.contact.nodeID,
      farmerId: params.farmer.nodeID
    });
    const downloader = utils.createShardDownloader(
      new Contact(params.farmer),
      hash,
      token
    );
    const hash256updater = through(function(data) {
      hasher256.update(data);
      this.queue(data);
    });

    function _onFinish() {
      if (item.hash !== utils.rmd160(hasher256.digest())) {
        self._logger.warn('mirror read integrity check failed, destroying');
        report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');
        item.shard.destroy(utils.warnOnError(self._logger));
      } else {
        self._logger.info('successfully mirrored shard');
        report.end(ExchangeReport.SUCCESS, 'MIRROR_SUCCESS');
      }
      bridgeClient.createExchangeReport(report);
    }

    report.begin(hash);
    downloader.on('error', function _onStreamError(err) {
      self._logger.error('failed to read from mirror node: %s', err.message);
      item.shard.destroy(utils.warnOnError(self._logger));
      report.end(ExchangeReport.FAILURE, 'MIRROR_FAILED');
      bridgeClient.createExchangeReport(report);
    }).pipe(hash256updater).pipe(item.shard).on('finish', _onFinish);
    callback(null, {});
  });
};
/**
 * @callback Protocol~handleMirrorCallback
 * @param {Error|null} err
 * @param {Object} result - Empty acknowledgement
 */

/**
 * Handles RETRIEVE messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {String} params.data_hash - RMD160(SHA256(shard_data))
 * @param {Protocol~handleRetrieveCallback} callback
 */
Protocol.prototype.handleRetrieve = function(params, callback) {
  var self = this;
  var hash = params.data_hash;
  var token = utils.generateToken();

  if (!kad.utils.isValidKey(hash)) {
    return callback(new Error('Invalid data hash provided: ' + hash));
  }

  self._network.storageManager.load(hash, function(err, item) {
    if (err) {
      return callback(err);
    }

    if (!item.getContract(params.contact)) {
      return callback(new Error('Retrieval is not authorized'));
    }

    if (typeof item.shard.write === 'function') {
      return callback(new Error('Shard data not found'));
    }

    // TODO: We will need to increment the download count to track payments

    self._logger.info(
      'authorizing data channel for %s', params.contact.nodeID
    );

    self._network.transport.shardServer.accept(
      token,
      item.hash,
      params.contact
    );
    callback(null, { token: token });
  });
};
/**
 * @callback Protocol~handleRetrieveCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {String} result.token - Authorization token for data channel
 */

/**
 * Handles PROBE messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {Protocol~handleProbeCallback} callback
 */
Protocol.prototype.handleProbe = function(params, callback) {
  var message = new kad.Message({
    method: 'PING',
    params: { contact: this._network.contact }
  });

  this._logger.info('performing probe for %s', params.contact.nodeID);
  this._network.transport.send(params.contact, message, function(err) {
    if (err) {
      return callback(new Error('Probe failed, you are not addressable'));
    }

    callback(null, {});
  });
};
/**
 * @callback Protocol~handleProbeCallback
 * @param {Error|null} err
 * @param {Object} result - Empty acknowledgement
 */

/**
 * Handles FIND_TUNNEL messages
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {Contact[]} params.relayers - List of contacts who have already
 * relayed the FIND_TUNNEL request
 * @param {Protocol~handleFindTunnelCallback} callback
 */
Protocol.prototype.handleFindTunnel = function(params, callback) {
  var tunServer = this._network.transport.tunnelServer;
  var numProxies = Object.keys(tunServer._proxies).length;
  var available = numProxies < tunServer._opts.maxProxiesAllowed;
  var knownTunnelers = this._network._tunnelers.getContactList();
  var tunnels = available ?
                [this._network.contact].concat(knownTunnelers) :
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
 * @callback Protocol~handleFindTunnelCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {Contact[]} result.tunnels - List of known tunnelers
 */

/**
 * Sends a FIND_TUNNEL to our seed on behalf of requester
 * @private
 */
Protocol.prototype._askNeighborsForTunnels = function(relayers, callback) {
  var self = this;
  var nearestNeighbors = this._network.router.getNearestContacts(
    this._network.contact.nodeID,
    3,
    this._network.contact.nodeID
  ).filter(function(contact) {
    return relayers.indexOf(contact.nodeID) === -1;
  });

  this._logger.info('asking nearest neighbors for known tunnels');

  function askNeighbor(neighbor, done) {
    self._network.transport.send(neighbor, kad.Message({
      method: 'FIND_TUNNEL',
      params: {
        contact: self._network.contact,
        relayers: [self._network.contact].concat(relayers)
      }
    }), function(err, response) {
      if (err || !Array.isArray(response.result.tunnels)) {
        return done(null, false);
      }

      if (response.result.tunnels && response.result.tunnels.length) {
        response.result.tunnels.forEach(function(tun) {
          if (self._network._tunnelers.getSize() < kad.constants.K) {
            self._network._tunnelers.addContact(new Contact(tun));
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
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {Protocol~handleOpenTunnelCallback} callback
 */
Protocol.prototype.handleOpenTunnel = function(params, callback) {
  var self = this;
  var tunnelServer = this._network.transport.tunnelServer;

  this._logger.info('opening gateway for %s', params.contact.nodeID);
  tunnelServer.addProxy(params.contact.nodeID, function(err, proxy) {
    if (err) {
      return callback(err);
    }

    if (!self._network.transport._requiresTraversal) {
      return callback(null, {
        proxyPort: proxy.getProxyPort()
      });
    }

    self._network.transport.createPortMapping(proxy.getProxyPort(), (err) => {
      if (err) {
        return callback(err);
      }

      callback(null, { proxyPort: proxy.getProxyPort() });
    });
  });
};
/**
 * @callback Protocol~handleOpenTunnelCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {String} result.tunnel - WebSocket URI including auth token
 * @param {Object} result.alias
 * @param {String} result.alias.address - Gateway address on the tunneler
 * @param {Number} result.alias.port - Gateway port on the tunneler
 */

/**
 * Handles TRIGGER messages
 * @see https://github.com/Storj/sips/blob/master/sip-0003.md
 * @param {Object} params
 * @param {String} params.behavior - Trigger behavior name to process
 * @param {Object} params.contents - Trigger content payload
 * @param {Contact} params.contact - Sender contact information
 * @param {Protocol~handleTriggerCallback} callback
 */
Protocol.prototype.handleTrigger = function(params, callback) {
  this._network.triggers.process(params, callback);
};
/**
 * @callback Protocol~handleTriggerCallback
 * @param {Error|null} err
 * @param {Object} result - Arbitrary key-value pairs
 */

/**
 * Handles RENEW messages
 * @see https://github.com/Storj/sips/blob/master/sip-0004.md
 * @param {Object} params
 * @param {Contact} params.contact - Sender contact information
 * @param {String} params.renter_id - Renter nodeID of the original contract
 * @param {String} params.renter_signature - Contract signature from original
 * node ID
 * @param {Object} params.contract - Updated contract data
 * @param {Protocol~handleRenewCallback} callback
 */
Protocol.prototype.handleRenew = function(params, callback) {
  var self = this;
  var updatedContract = null;
  var dataHash = null;

  try {
    assert.ok(params.renter_id, 'No original renter_id was supplied');
    assert.ok(params.renter_signature, 'No original renter signature supplied');

    updatedContract = Contract.fromObject(params.contract);
    dataHash = updatedContract.get('data_hash');

    assert.ok(
      updatedContract.verifyExternal(
        params.renter_signature,
        params.renter_id
      ),
      'Invalid original renter signature on updated contract'
    );
    assert.ok(
      updatedContract.verify('renter', updatedContract.get('renter_id')),
      'Invalid new renter signature on updated contract'
    );
  } catch (err) {
    return callback(err);
  }

  this._network.storageManager.load(dataHash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var originalContract = item.getContract({ nodeID: params.renter_id });

    if (!originalContract) {
      return callback(new Error('No contract found for renter_id'));
    }

    var changedProperties = Contract.diff(originalContract, updatedContract);

    // TODO: Come back and consider how to handle attacks on store time
    for (var i = 0; i < changedProperties.length; i++) {
      if (Protocol.RENEW_PROPS_ALLOWED.indexOf(changedProperties[i]) === -1) {
        return callback(new Error(changedProperties[i] + ' cannot be changed'));
      }
    }

    updatedContract.sign('farmer', self._network.keyPair.getPrivateKey());
    item.removeContract({ nodeID: params.renter_id });
    item.addContract({
      nodeID: updatedContract.get('renter_id'),
      hdKey: updatedContract.get('renter_hd_key'),
      hdIndex: updatedContract.get('renter_hd_index')
    }, updatedContract);

    self._network.storageManager.save(item, function(err) {
      if (err) {
        return callback(new Error('Failed to save updated contract'));
      }

      callback(null, { contract: updatedContract.toObject() });
    });
  });
};
/**
 * @callback Protocol~handleRenewCallback
 * @param {Error|null} err
 * @param {Object} result
 * @param {Object} result.contract - Signed updated contract
 */

/**
 * Returns bound references to the protocol handlers
 * @returns {Object} handlers
 */
Protocol.prototype.getRouteMap = function() {
  return {
    OFFER: this.handleOffer.bind(this),
    AUDIT: this.handleAudit.bind(this),
    CONSIGN: this.handleConsign.bind(this),
    MIRROR: this.handleMirror.bind(this),
    RETRIEVE: this.handleRetrieve.bind(this),
    PROBE: this.handleProbe.bind(this),
    FIND_TUNNEL: this.handleFindTunnel.bind(this),
    OPEN_TUNNEL: this.handleOpenTunnel.bind(this),
    TRIGGER: this.handleTrigger.bind(this),
    RENEW: this.handleRenew.bind(this)
  };
};

module.exports = Protocol;
