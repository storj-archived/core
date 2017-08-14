'use strict';

const async = require('async');
const kfs = require('kfs');
const fs = require('fs');
const path = require('path');
const kad = require('kad');
const Network = require('./');
const inherits = require('util').inherits;
const StorageItem = require('../storage/item');
const Contract = require('../contract');
const merge = require('merge');
const constants = require('../constants');
const utils = require('../utils');
const {execFile} = require('child_process');

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
 * @param {String} options.bridges - An array of bridges to connect and accept contracts
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
 * @param {Number} [options.maxShardSize] - Max number of bytes to allow as contract shard size
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

  this._contractCount = 0;
  this._dataReceivedCount = 0;
  this._negotiator = options.contractNegotiator;
  this._pendingOffers = [];
  this._offerBackoffLimit = options.offerBackoffLimit;
  this._renterWhitelist = Array.isArray(options.renterWhitelist) ?
                          options.renterWhitelist :
                          null;
  this._maxShardSize = options.maxShardSize;

  Network.call(this, options);

  this._protocol.handleAlloc = this.handleAlloc.bind(this);
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

// eslint-disable-next-line max-statements
FarmerInterface.Negotiator = function(contract, callback) {
  /* eslint complexity: [2, 7] */
  var self = this;

  if (this._maxShardSize && this._maxShardSize < contract.get('data_size')) {
    return callback(false);
  }

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
  var concurrentTransfer = (
    self.transport.shardServer.activeTransfers >= self._offerBackoffLimit
  );
  self._logger.debug(
    'active transfers %s is less than offerBackoffLimit %s: %s',
    self.transport.shardServer.activeTransfers,
    self._offerBackoffLimit,
    !concurrentTransfer
  );
  if (concurrentTransfer) {
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

    self._logger.debug('shard already stored, not sending offer');
    callback(false);
  });
};

FarmerInterface.DEFAULTS = {
  renterWhitelist: fs.readFileSync(
    path.join(__dirname, '../../TRUSTED_KEYS') // TODO get this from bridges config
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

    /* istanbul ignore next*/
    self.transport.shardServer.on('shardUploaded', function(){
      if (self._dataReceivedCount < Number.MAX_SAFE_INTEGER) {
        self._dataReceivedCount++;
      } else {
        self._dataReceivedCount = 0;
      }
    });

    callback();
  });
};

/**
 * Will connect to configured bridges to start receiving storage
 * contracts from them. If the contact is already at the bridge it will
 * update the contact details, otherwise it will add the contact to
 * and begin the benchmarking phase.
 */
FarmerInterface.prototype.connectBridges = function() {
  const bridges = this._options.bridges;

  async.eachSeries(bridges, (bridge, next) => {
    this._connectBridge(bridge, (err) => {
      if (err) {
        this._logger.error('Unable to connect to bridge: %s', bridge.url);
        return next();
      }
      this.emit('bridgeConnected', bridge);
      next();
    });
  }, (err) => {
    if (err) {
      return this._logger.error('Unable to connect to bridges');
    }
    this.emit('bridgesConnected');
    this._logger.info('Finished connecting to bridges');
  });
};

FarmerInterface.prototype._connectBridge = function(bridge, callback) {
  let headers = {};
  let body = {};
  let path = '/contacts/' + this.contact.nodeID;
  this._bridgeRequest(bridge.url, 'GET', path, headers, body, (err, contact) => {
    if (err) {
      return callback(err);
    }

    if (!contact) {
      this._addBridgeContact(bridge.url, callback);

    } else if (contact.address !== this.contact.address ||
        contact.port !== this.contact.port) {
      this._updateBridgeContact(bridge.url, callback);
    } else {
      callback();
    }
  });
}

FarmerInterface.prototype._addBridgeContact = function(bridge, callback) {
  let target = null;
  let challenge = null;
  let nonce = null;

  async.series([
    (next) => {
      this._bridgeRequest(bridge.url, 'POST', '/contacts/challenges', (err) => {
        if (err) {
          return callback(err);
        }
        target = data.target;
        challenge = data.challenge;
        next();
      });
    },
    (next) => {
      this._completeChallenge(challenge, target, (err, _nonce) => {
        if (err) {
          return next(err);
        }
        nonce = _nonce;
      });
    },
    (next) => {
      this._bridgeRequest(bridge.url, 'POST', '/contacts', nonce, this.contact, next);
    }
  ], callback);
}

FarmerInterface.prototype._completeChallenge = function(challenge, target, callback) {
  const powScript = path.resolve(__dirname, './pow.js')
  const args = [JSON.stringify({challenge: challenge, target: target})];
  const options = {
    timeout: 900000
  };
  execFile(powScript, args, options, (err, stdout, stderr) => {
    if (err) {
      return callback(err);
    }
    callback(null, stdout);
  });
}

FarmerInterface.prototype._getSigHash = function(url,
                                                 method,
                                                 path,
                                                 timestamp,
                                                 rawbody) {
  const hasher = crypto.createHash('sha256');
  hasher.update(method);
  hasher.update(url + path);
  hasher.update(timestamp.toString());
  hasher.update(rawbody);
  return hasher.digest();
}

FarmerInterface.prototype._bridgeRequest = function(url,
                                                    method,
                                                    path,
                                                    headers,
                                                    body,
                                                    callback) {

  const timestamp = Date.now();
  const rawbody = JSON.stringify(body);
  const sighash = this._getSigHash(url, method, path, timestamp, rawbody);

  const privkey = Buffer.from(this.keyPair.getPrivateKey(), 'hex');
  const sigObj = secp256k1.sign(sighash, privkey);
  const sig = secp256k1.signatureExport(sigObj.signature).toString('hex');

  headers['x-node-timestamp'] = timestamp;
  headers['x-node-id'] = this.contact.nodeID;
  headers['x-node-signature'] = sig;
  headers['x-node-pubkey'] = this.keyPair.getPublicKey();
  headers['content-type'] = 'application/json';

  const options = {
    headers: headers,
    method: method,
    path: path,
    hostname: url
  };

  const req = http.request(options, (res) => {

    const str = '';
    let json = null;

    res.setEncoding('utf8');

    res.on('data', (chunk) => {
      buf += chunk.toString();
    });

    res.on('end', () => {
      try {
        json = JSON.parse(str);
      } catch(err) {
        callback(new Error('Unable to parse response'));
      }

      callback(null, json);
    });

  });

  req.on('error', callback);

  req.write(rawbody);
  req.end();
}

FarmerInterface.prototype._updateBridgeContact = function(bridge, callback) {
  const headers = {};
  const body = {
    address: this.contact.address,
    port: this.contact.port
  };
  this._bridgeRequest(bridge.url,
                      'PATCH',
                      '/contacts/' + this.contact.nodeID,
                      headers,
                      body,
                      callback)
}

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

  self._logger.debug('Sending offer for contract hash %s',
    contract.get('data_hash'));
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
FarmerInterface.prototype._negotiateContract = function(contract, contact) {
  var self = this;

  contract.set('farmer_id', self.keyPair.getNodeID());
  contract.set('payment_destination', self.getPaymentAddress());
  contract.sign('farmer', self.keyPair.getPrivateKey());

  var item = new StorageItem({ hash: contract.get('data_hash') });
  var renterId = contract.get('renter_id');

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

    self._sendOfferForContract(contract, contact);
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

  this._negotiator.call(this, contract, function(shouldNegotiate) {
    /* eslint max-statements: [2, 16] */
    self._logger.debug('negotiator returned: %s', shouldNegotiate);
    self.storageManager._storage.size(
      contract.get('data_hash'),
      function(err, usedSpace, contractDBSize) {
        if (err) {
          self._logger.error('Could not get usedSpace: %s',err.message);
          return callback(false);
        }

        var maxCapacity = self.storageManager._options.maxCapacity;
        var estimatedMaxBucketSize = Math.floor(
          (maxCapacity - contractDBSize) / kfs.constants.B
        );
        var freeSpace = estimatedMaxBucketSize - usedSpace;
        var enoughFreeSpace = contract.get('data_size') <= freeSpace;
        self._logger.debug(
          'max KFS bucket size %s, used %s, free %s, shard size %s',
          estimatedMaxBucketSize,
          usedSpace,
          freeSpace,
          contract.get('data_size'));
        self._logger.debug('we have enough free space: %s', enoughFreeSpace);

        callback(shouldNegotiate && enoughFreeSpace);
      }
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

  self.storageManager.load(contract.get('data_hash'), function(err, item) {
    if (err) {
      item = new StorageItem({ hash: contract.get('data_hash') });
    }

    item.addContract(renter, contract);
    item.addMetaData(renter, {});
    self.storageManager.save(item, utils.noop);
    self._logger.info('Offer accepted');
    if (self._contractCount < Number.MAX_SAFE_INTEGER) {
      self._contractCount++;
    } else {
      self._contractCount = 0;
    }
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
 * Handles received contract publications
 * @private
 * @param {Object} contract - The raw contract object
 */
FarmerInterface.prototype._handleContractPublication = function(contract) {
  var self = this;
  var contractObj;
  var contact = contract.contact;

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
    self._negotiateContract(contractObj, contact);
  });
};

/**
 * Handles CLAIM messages
 * @param {Object} params
 * @param {Protocol~handleConsignCallback} callback
 */
FarmerInterface.prototype.handleAlloc = function(params, callback) {
  var self = this;
  var token = utils.generateToken();

  let contractObj = null;

  try {
    contractObj = Contract.fromObject(params.contract);
  } catch (err) {
    callback(new Error('Invalid contract'));
    return;
  }

  this._shouldSendOffer(contractObj, function(shouldSendOffer) {
    if (!shouldSendOffer) {
      // TODO give back a reason
      callback(new Error('Not accepting contracts'));
      self._logger.debug('not sending an offer for the contract');
      return;
    }

    self._addContractToPendingList(contractObj);

    contractObj.set('farmer_id', self.keyPair.getNodeID());
    contractObj.set('payment_destination', self.getPaymentAddress());
    contractObj.sign('farmer', self.keyPair.getPrivateKey());

    var item = new StorageItem({ hash: contractObj.get('data_hash') });
    var renterId = contractObj.get('renter_id');

    if (typeof renterId !== 'string') {
      self._removeContractFromPendingList(contractObj);
      return self._logger.warn('dropping invalid contract with no renter id');
    }

    item.addContract({ nodeID: renterId }, contractObj);
    item.addMetaData({ nodeID: renterId }, {});

    self.storageManager.save(item, function(err) {
      if (err) {
        self._removeContractFromPendingList(contract);
        return self._logger.error(err.message);
      }

      // TODO these tokens will need to be persistent
      self.transport.shardServer.accept(
        token,
        contractObj.get('data_hash'),
        params.contact
      );

      callback(null, { token: token, contract: contractObj.toObject() });

    });

  });
}

module.exports = FarmerInterface;
