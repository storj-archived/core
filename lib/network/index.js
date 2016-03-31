'use strict';

var semver = require('semver');
var info = require('../../package');
var path = require('path');
var url = require('url');
var assert = require('assert');
var merge = require('merge');
var async = require('async');
var kad = require('kad');
var ms = require('ms');
var bitcore = require('bitcore-lib');
var constants = require('../constants');
var Message = require('bitcore-message');
var Quasar = require('kad-quasar').Protocol;
var utils = require('../utils');
var KeyPair = require('../keypair');
var Manager = require('../manager');
var StorageItem = require('../storage/item');
var Protocol = require('./protocol');
var Contract = require('../contract');
var Contact = require('./contact');
var Audit = require('../audit');
var Verification = require('../verification');
var Transport = require('./transport');
var DataChannelServer = require('../datachannel/server');
var DataChannelClient = require('../datachannel/client');

/**
 * Storj network interface
 * @constructor
 * @param {Object} options
 * @param {KeyPair} options.keypair - Node's cryptographic identity
 * @param {Manager} options.manager - Persistence management interface
 * @param {Number} options.loglevel - Verbosity level 0 - 4
 * @param {Object} options.logger - Optional logger override
 * @param {Array} options.seeds - List of seed URIs to join
 * @param {String} options.datadir - Directory path to store data
 * @param {Object} options.contact
 * @param {String} options.contact.address - Public node IP or hostname
 * @param {Number} options.contact.port - Listening port for RPC
 * @param {Array} options.farmer - List of topic strings to subscribe
 * @param {Boolean} options.noforward - Flag for skipping traversal strategies
 */
function Network(options) {
  if (!(this instanceof Network)) {
    return new Network(options);
  }

  var self = this;

  assert(options.keypair instanceof KeyPair, 'Invalid keypair supplied');
  assert(options.manager instanceof Manager, 'Invalid manager supplied');

  this._pendingContracts = {};
  this._keypair = options.keypair;
  this._manager = options.manager;
  this._options = merge(Object.create(Network.DEFAULTS), options);
  this._logger = options.logger || new kad.Logger(options.loglevel, 'STORJ');
  this._contact = new Contact(
    merge(this._options.contact, { nodeID: this._keypair.getNodeID() })
  );
  this._transport = new Transport(this._contact, {
    logger: this._logger,
    cors: true,
    // TODO: make this configurable allow farmers to tunnel for others
    tunnelhost: 'http://tunnel.metadisk.org',
    noforward: this._options.noforward
  });

  this._transport.after('open', function() {
    self._channel = new DataChannelServer({
      transport: self._transport,
      manager: self._manager,
      logger: self._logger
    });
  });

  this._router = new kad.Router({
    transport: this._transport,
    logger: this._logger
  });
  this._pubsub = new Quasar(this._router, {
    logger: this._logger
  });

  if (this._options.datadir) {
    this._storage = new kad.storage.FS(
      path.join(this._options.datadir, 'items')
    );
  } else {
    this._storage = new kad.storage.MemStore();
  }

  this._pubkeys = {};
  this._open = false;

  this._initShardReaper();
}

Network.DEFAULTS = {
  loglevel: 3,
  seeds: [],
  datadir: null,
  contact: {
    address: '127.0.0.1',
    port: 4000,
  },
  farmer: [],
  noforward: false
};

/**
 * Opens the connection to the network
 * @param {Function} callback - Called on successful network join
 */
Network.prototype.join = function(callback) {
  var self = this;
  var seeds = this._options.seeds.map(this._createContact);
  var protocol = new Protocol({ network: this });

  assert(!this._open, 'Network interface already open');

  this._transport.on('error', this._handleTransportError.bind(this));
  this._transport.before('serialize', this._signMessage.bind(this));
  this._transport.before('receive', this._verifyMessage.bind(this));
  this._transport.before('receive', kad.hooks.protocol(protocol.handlers()));

  this._node = new kad.Node({
    transport: this._transport,
    router: this._router,
    storage: this._storage,
    logger: this._logger
  });

  this._open = true;

  async.each(seeds, function(contact, next) {
    self._node.connect(contact, function(err) {
      if (!err) {
        self._addPingInterval(contact, ms('5m'));
      }
    });
    next();
  }, function() {
    if (self._options.farmer.length) {
      self._farm();
    }

    callback(null, self);
  });
};

/**
 * Disconnects from the network
 * @param {Function} callback - Called when successful disconnect
 */
Network.prototype.leave = function(callback) {
  this._removePingInterval();
  this._node.disconnect(callback);
};

/**
 * Look up the storage contract by the hash to find the node who has
 * the shard. Look up the appropriate challenge and send it to the node
 * for verification. If successful, invalidate the challenge and pass,
 * otherwise, invalidate the contract.
 * @param {String} hash - RIPEMD-160 SHA-256 hash of the file to audit
 * @param {Function} callback - Called with validity information
 */
Network.prototype.audit = function(hash, callback) {
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
Network.prototype.retrieve = function(hash, callback) {
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
 * @param {Buffer} data - Raw binary blob to store
 * @param {String} duration - String representation of time for `ms` like "2w"
 * @param {Function} callback - Called on successful store
 */
Network.prototype.store = function(data, duration, callback) {
  assert(Buffer.isBuffer(data), 'Invalid data supplied');
  assert(typeof duration === 'string', 'Invalid duration supplied');
  assert(typeof callback === 'function', 'Callback is not a function');

  var self = this;
  var shardHash = utils.rmd160sha256(data);
  var contract = new Contract({
    renter_id: this._keypair.getNodeID(),
    data_size: data.length,
    data_hash: shardHash,
    store_begin: Date.now(),
    store_end: Date.now() + ms(duration),
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

  self._publish(contract);
};

/**
 * Subscribes to all storage contracts and issues offers, for now this just
 * accepts the initial offer and signs it
 * @private
 */
Network.prototype._farm = function() {
  var self = this;
  var topics = self._options.farmer;

  topics.forEach(function(topic) {
    self._subscribe(topic, self._negotiateContract.bind(self));
  });
};

/**
 * Handles a received contract and negotiates storage
 * @private
 * @param {Contract} contract
 */
Network.prototype._negotiateContract = function(contract) {
  var self = this;

  // TODO: Refactor all of this.

  contract.set('farmer_id', self._keypair.getNodeID());
  contract.set('payment_destination', self._keypair.getAddress());
  contract.sign('farmer', self._keypair.getPrivateKey());

  var final;
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

        try {
          final = Contract.fromObject(response.result.contract);
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
      });
    });
  });
};

/**
 * Publishes a contract to the network
 * @private
 * @param {Contract} contract
 */
Network.prototype._publish = function(contract) {
  assert(contract instanceof Contract, 'Invalid contract supplied');
  return this._pubsub.publish(contract.getTopicString(), contract.toObject());
};

/**
 * Subscribes to a contract identifier on the network
 * @private
 * @param {String} identifier
 * @param {Function} handler
 */
Network.prototype._subscribe = function(identifier, handler) {
  return this._pubsub.subscribe(identifier, function(contract) {
    var contractObj;

    try {
      contractObj = Contract.fromObject(contract);
    } catch (err) {
      return false; // If the contract is invalid just drop it
    }

    handler(contractObj);
  });
};

/**
 * Connects to the node at the given URI
 * @private
 * @param {String} uri
 * @param {Function} callback
 */
Network.prototype._connect = function(uri, callback) {
  return this._node.connect(this._createContact(uri), callback);
};

/**
 * Returns a Storj contact from the URI
 * @private
 * @param {String} uri
 */
Network.prototype._createContact = function(uri) {
  var parsed = url.parse(uri);

  return new kad.contacts.AddressPortContact({
    address: parsed.hostname,
    port: Number(parsed.port),
    nodeID: parsed.path.substr(1)
  });
};

/**
 * Signs an outgoing message
 * @private
 * @param {kad.Message} message
 * @param {Function} callback
 */
Network.prototype._signMessage = function(message, callback) {
  var nonce = Date.now();
  var target = message.id + nonce;
  var signature = Message(target).sign(this._keypair._privkey);

  if (kad.Message.isRequest(message)) {
    message.params.nonce = nonce;
    message.params.signature = signature;
  } else {
    message.result.nonce = nonce;
    message.result.signature = signature;
  }

  callback();
};

/**
 * Verifies an incoming message
 * @private
 * @param {kad.Message} message
 * @param {Contact} contact
 * @param {Function} callback
 */
Network.prototype._verifyMessage = function(message, contact, callback) {
  var nonce, signature;

  if (!semver.satisfies(contact.protocol, '^' + info.version)) {
    return callback(new Error('Protocol version is incompatible'));
  }

  if (kad.Message.isRequest(message)) {
    nonce = message.params.nonce;
    signature = message.params.signature;
  } else {
    nonce = message.result.nonce;
    signature = message.result.signature;
  }

  if (Date.now() > (constants.NONCE_EXPIRE + nonce)) {
    return callback(new Error('Message signature expired'));
  }

  var target = message.id + nonce;
  var addr = bitcore.Address.fromPublicKeyHash(Buffer(contact.nodeID, 'hex'));

  var compactSig;
  var signobj;

  try {
    compactSig = new Buffer(signature, 'base64');
    signobj = bitcore.crypto.Signature.fromCompact(compactSig);
  } catch (err) {
    return callback(new Error('Signature verification failed'));
  }

  var signedmsg = Message(target);
  var ecdsa = new bitcore.crypto.ECDSA();

  ecdsa.hashbuf = signedmsg.magicHash();
  ecdsa.sig = signobj;

  this._pubkeys[contact.nodeID] = ecdsa.toPublicKey();

  if (!signedmsg.verify(addr, signature)) {
    return callback(new Error('Signature verification failed'));
  }

  callback();
};

/**
 * Proxies error events from the underlying transport adapter
 * @private
 * @param {Error} error
 */
Network.prototype._handleTransportError = function(error) {
  this._logger.error(error.message);
};

/**
 * Setup a PING message to the given contact on an interval
 * @private
 * @param {Contact} contact
 * @param {Number} interval
 */
Network.prototype._addPingInterval = function(contact, interval) {
  assert(typeof interval === 'number', 'Invalid interval supplied');

  var self = this;

  if (!this._pingSeeds) {
    this._pingSeeds = {};
  }

  function pingSeed() {
    self._transport.send(contact, new kad.Message({
      method: 'PING',
      params: { contact: self._node._self }
    }), function noop() {});
  }

  this._pingSeeds[contact.nodeID] = setInterval(pingSeed, interval);
};

/**
 * Stop sending PING message to the given contact
 * @private
 * @param {Contact} contact
 */
Network.prototype._removePingInterval = function(contact) {
  if (!contact) {
    for (var nodeID in this._pingSeeds) {
      clearInterval(this._pingSeeds[nodeID]);
    }
  } else {
    clearInterval(this._pingSeeds[contact.nodeID]);
  }
};

/**
 * Initialize the shard reaper to check for stale contracts and reap shards
 * @private
 */
Network.prototype._initShardReaper = function() {
  var self = this;

  function startReapInterval() {
    setInterval(
      self._manager.clean.bind(self, function() {}),
      constants.CLEAN_INTERVAL
    );
  }

  this._logger.info('scanning for expired storage contracts');
  this._manager.clean(startReapInterval);
};

module.exports = Network;
