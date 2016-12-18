'use strict';

var assert = require('assert');
var merge = require('merge');
var async = require('async');
var kad = require('kad');
var HDKey = require('hdkey');
var bitcore = require('bitcore-lib');
var secp256k1 = require('secp256k1');
var constants = require('../constants');
var Message = require('bitcore-message');
var Quasar = require('kad-quasar').Protocol;
var utils = require('../utils');
var KeyPair = require('../crypto-tools/keypair');
var StorageManager = require('../storage/manager');
var Protocol = require('./protocol');
var Contact = require('./contact');
var Transport = require('./transport');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var diglet = require('diglet');
var shuffle = require('knuth-shuffle').knuthShuffle;
var BridgeClient = require('../bridge-client');
var TriggerManager = require('../sips').SIP0003.TriggerManager;
var OfferManager = require('../contract/offer-manager');

/**
 * Storj network interface
 * @constructor
 * @license AGPL-3.0
 * @param {Object}  options
 * @param {String} [options.hdKey] - Extended SIP32 private key at 'group index'
 * @param {Number} [options.hdIndex] - Derivation index for hdKey
 * @param {KeyPair}[options.keyPair] - Node's cryptographic identity
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {String}  options.bridgeUri - URL for bridge server seed lookup
 * @param {Object}  options.logger - Logger instance
 * @param {Array}   options.seedList - List of seed URIs to join
 * @param {String}  options.rpcAddress - Public node IP or hostname
 * @param {Number}  options.rpcPort - Listening port for RPC
 * @param {Boolean} options.doNotTraverseNat - Skip NAT traversal strategies
 * @param {Number}  options.maxTunnels - Max number of tunnels to provide
 * @param {Number}  options.maxConnections - Max concurrent connections
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  options.tunnelGatewayRange.min - Min port for gateway bind
 * @param {Number}  options.tunnelGatewayRange.max - Max port for gateway bind
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
 * @property {ShardServer} shardServer
 * @property {OfferManager} offerManager
 */
function Network(options) {
  if (!(this instanceof Network)) {
    return new Network(options);
  }

  this._initKeyPair(options);
  this.storageManager = options.storageManager;
  this.offerManager = new OfferManager();

  this._tunnelers = kad.Bucket();
  this._options = this._checkOptions(options);
  this._logger = options.logger;
  this._storage = new kad.storage.MemStore();
  this._pubkeys = {};
  this._hdcache = {};
  this._open = false;

  this._initNetworkInterface();
}

inherits(Network, EventEmitter);

Network.prototype._initKeyPair = function(options) {
  if (options.hdKey) {
    assert(!options.keyPair, '"keyPair" is not expected with "hdKey"');
    assert(options.hdIndex, '"hdIndex" is expected with "hdKey"');
    this.hdKey = HDKey.fromExtendedKey(options.hdKey);
    this.hdIndex = options.hdIndex;
    var key = this.hdKey.deriveChild(this.hdIndex);
    this.keyPair = new KeyPair(key.privateKey.toString('hex'));
  } else {
    this.hdKey = null;
    this.hdIndex = null;
    this.keyPair = options.keyPair;
  }
};

/**
 * Triggered when the transport's network interface is ready
 * @event Network#ready
 */

/**
 * Triggered when the node has entered the overlay network
 * @event Network#connected
 */

/**
 * Triggered when the node has exited the overlay network
 * @event Network#disconnected
 */

/**
 * Triggered when an error occurs
 * @event Network#error
 */

/**
 * Triggered when a valid offer is received, but we are not waiting for one
 * @event Network#unhandledOffer
 * @param {Contact} contact - The farmer contact the offer is from
 * @param {Contract} contract - The complete contract, signed by us and farmer
 * @param {Protocol~unhandledOfferResolver}
 */

/**
 * Triggered when an unhandled offer is handled by the
 * {@link Network#unhandledOffer} listener by calling the event's supplied
 * {@link Network~unhandledOfferResolver}
 * @event Network#unhandledOfferResolved
 * @param {Contact} contact - The farmer contact the offer is from
 * @param {Contract} contract - The complete contract, signed by us and farmer
 */

Network.DEFAULTS = {
  bridgeUri: process.env.STORJ_BRIDGE || 'https://api.storj.io',
  seedList: [],
  joinRetry: { times: 1, interval: 5000 },
  rpcAddress: '127.0.0.1',
  rpcPort: 4000,
  doNotTraverseNat: false,
  maxTunnels: 3,
  maxConnections: 150,
  tunnelServerPort: 4001,
  tunnelGatewayRange: { min: 4002, max: 4004 }
};

Network.RPC_VALIDATION_EXEMPT = [
  'PROBE',
  'FIND_TUNNEL',
  'OPEN_TUNNEL'
];

/**
 * Check the options supplied to the constructor
 * @private
 */
Network.prototype._checkOptions = function(options) {
  assert(
    options.keyPair instanceof KeyPair || typeof options.hdKey === 'string',
    'Invalid keypair supplied'
  );
  assert(
    options.storageManager instanceof StorageManager,
    'Invalid manager supplied'
  );
  assert.ok(this._validateLogger(options.logger), 'Invalid logger supplied');

  return merge(JSON.parse(JSON.stringify(Network.DEFAULTS)), options);
};

/**
 * Validates the logger object supplied
 * @private
 */
Network.prototype._validateLogger = function(logger) {
  return logger && logger.debug && logger.warn && logger.info && logger.error;
};

/**
 * Binds the transport adapter's hooks and events
 * @private
 */
Network.prototype._bindTransportHooks = function() {
  this.transport.on('error', this._handleTransportError.bind(this));
  this.transport.before('serialize', this._signMessage.bind(this));
  this.transport.before('receive', this._verifyMessage.bind(this));
  this.transport.before('receive', kad.hooks.protocol(
    this._protocol.getRouteMap()
  ));
  this.transport.after('receive', this._updateActivityCounter.bind(this));
};

/**
 * Opens the connection to the network
 * @param {Function} callback - Called on successful network join
 */
Network.prototype.join = function(callback) {
  var self = this;

  if (!this._ready) {
    return this.once('ready', this.join.bind(this, callback));
  }

  this.node = new kad.Node({
    transport: this.transport,
    router: this.router,
    storage: this._storage,
    logger: this._logger
  });

  if (typeof callback === 'function') {
    self.once('error', callback);
    self.once('connected', function() {
      if (self.transport._isPublic) {
        self._listenForTunnelers();
      }

      self.removeListener('error', callback);
      callback(null, self);
    });
  }

  function onJoinComplete(err) {
    if (err) {
      return self.emit('error', err);
    }

    self.emit('connected');
  }

  async.series(
    [
      this._warnIfClockNotSynced.bind(this), // TODO: Make this not fail hard
      this.storageManager.open.bind(this.storageManager),
      this._setupTunnelClient.bind(this),
    ],
    function(err) {
      if (err) {
        return self.emit('error', err);
      }

      // enter overlay network and retry if failed
      async.retry(
        {
          times: self._options.joinRetry.times,
          interval: self._options.joinRetry.interval
        },
        self._enterOverlay.bind(self),
        onJoinComplete
      );
    }
  );
};

/**
 * Iteratively attempt connection to network via supplied seeds
 * @private
 */
Network.prototype._enterOverlay = function(onConnected) {
  var self = this;

  function _trySeeds() {
    async.detectSeries(self._options.seedList, function(uri, next) {
      self._logger.info('attempting to join network via %s', uri);
      self.connect(uri, function(err) {
        if (err) {
          self._logger.warn('failed to connect to seed %s', uri);
          next(null, false);
        } else {
          self._logger.info('connected to the storj network via %s', uri);
          next(null, true);
        }
      });
    }, function(err, result) {
      if (err || !result) {
        return onConnected(new Error('Failed to join the network'));
      }

      // NB: Force re-entry into network to refresh routes every 10 minutes
      setTimeout(_trySeeds, constants.NET_REENTRY);
      onConnected(null);
    });
  }

  if (this._options.seedList.length) {
    return _trySeeds();
  }

  if (this._options.bridgeUri === null) {
    self._logger.warn('no bridge uri or seeds provided, not connected');
    return onConnected(null);
  }

  this._logger.info('resolving seeds from %s', this._options.bridgeUri);
  this.bridgeClient.getContactList({ connected: true }, function(err, seeds) {
    if (err) {
      return onConnected(
        new Error('Failed to discover seeds from bridge: ' + err.message)
      );
    }

    self._options.seedList = shuffle(seeds)
      .filter((c) => c.nodeID !== self.contact.nodeID)
      .filter((c) => utils.isCompatibleVersion(
        c.protocol,
        process.env.STORJ_ALLOW_LOOPBACK
      ))
      .filter((c) => utils.isValidContact(c))
      .map(utils.getContactURL);

    _trySeeds();
  });
};

/**
 * Disconnects from the network
 * @param {Function} callback - Called when successful disconnect
 */
Network.prototype.leave = function(callback) {
  var self = this;

  if (typeof callback === 'function') {
    this.once('error', callback);
    this.once('disconnected', function() {
      this.removeListener('error', callback);
      callback(null);
    });
  }

  this.storageManager.close(function(err) {
    if (err) {
      return self.emit('error', err);
    }

    self.node.disconnect(function(err) {
      if (err) {
        return self.emit('error', err);
      }

      self.emit('disconnected');
    });
  });
};

/**
 * Publishes a topic with content to the network
 * @param {String} topic - The serialized opcode topic
 * @param {Object} contents - Arbitrary publication contents
 * @param {Object} options - Options to pass to kad-quasar
 */
Network.prototype.publish = function(topic, contents, options) {
  return this._pubsub.publish(topic, contents, options);
};

/**
 * Subscribes to a topic on the network
 * @param {String} topic - The serialized opcode topic
 * @param {Object} handler - Function to handle received publications
 */
Network.prototype.subscribe = function(topic, handler) {
  return this._pubsub.subscribe(topic, handler);
};

/**
 * Connects to the node at the given URI
 * @param {String} uri - The storj protocol URI to connect
 * @param {Function} callback - Called on connection or error
 */
Network.prototype.connect = function(uri, callback) {
  const self = this;

  callback = typeof callback === 'function' ? callback : function(err) {
    if (err) {
      self._logger.warn('failed to connect to %s, reason: %s',
                        uri, err.message);
    } else {
      self._logger.info('connection established with %s', uri);
    }
  };

  if (!Contact.isValidUrl(uri)) {
    return callback(new Error('Invalid contact URI supplied'));
  }

  return this.node.connect(Contact.fromUrl(uri), callback);
};

/**
 * Initilizes the network interface
 * @private
 */
Network.prototype._initNetworkInterface = function() {
  EventEmitter.call(this);

  this.triggerManager = new TriggerManager();
  this.bridgeClient = new BridgeClient(this._options.bridgeUri, {
    logger: this._logger
  });
  this.contact = new Contact({
    address: this._options.rpcAddress,
    port: this._options.rpcPort,
    nodeID: this.keyPair.getNodeID(),
    hdKey: this.hdKey ? this.hdKey.publicExtendedKey : undefined,
    hdIndex: this.hdIndex ? this.hdIndex : undefined
  });
  this.transport = new Transport(this.contact, {
    logger: this._logger,
    maxTunnels: this._options.maxTunnels,
    maxConnections: this._options.maxConnections,
    tunnelGatewayRange: this._options.tunnelGatewayRange,
    doNotTraverseNat: this._options.doNotTraverseNat,
    storageManager: this.storageManager,
    bridgeClient: this._bridgeClient
  });
  this.router = new kad.Router({
    transport: this.transport,
    logger: this._logger
  });

  this._protocol = new Protocol({ network: this });
  this.transport.after('open', this._onTransportOpen.bind(this));
  this._startRouterCleaner();
};

/**
 * Set up {@link ShardServer} after transport is ready
 * @private
 */
Network.prototype._onTransportOpen = function() {
  this._bindTransportHooks();

  this._ready = true;
  this._pubsub = new Quasar(this.router, {
    logger: this._logger,
    randomRelay: true,
    maxRelayHops: constants.PUBLISH_TTL
  });

  this.emit('ready');
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
  var signature = null;

  try {
    signature = this.keyPair.sign(target);
  } catch(err) {
    return callback(err);
  }

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
 * Verifies that the supplied contact is valid and compatible
 * @private
 * @param {Contact} contact
 */
Network.prototype._validateContact = function(contact, callback) {
  if (!utils.isCompatibleVersion(contact.protocol)) {
    this.router.removeContact(contact);
    return callback(new Error('Protocol version is incompatible'));
  }

  if (!utils.isValidContact(contact, process.env.STORJ_ALLOW_LOOPBACK)) {
    this.router.removeContact(contact);
    return callback(new Error('Invalid contact data supplied'));
  }

  callback(null);
};

/**
 * Verifies an incoming message
 * @private
 * @param {kad.Message} message
 * @param {Contact} contact
 * @param {Function} callback
 */
Network.prototype._verifyMessage = function(message, contact, callback) {
  var self = this;

  this._validateContact(contact, function(err) {
    if (err && Network.RPC_VALIDATION_EXEMPT.indexOf(message.method) === -1) {
      return callback(err);
    }

    var messagekey = kad.Message.isRequest(message) ? 'params' : 'result';
    var nonce = message[messagekey].nonce;
    var signature = message[messagekey].signature;

    if (Date.now() > (constants.NONCE_EXPIRE + nonce)) {
      return callback(new Error('Message signature expired'));
    }

    var addr = bitcore.Address.fromPublicKeyHash(Buffer(contact.nodeID, 'hex'));
    var signobj = self._createSignatureObject(signature);

    self._verifySignature({
      message: message,
      nonce: nonce,
      signobj: signobj,
      address: addr,
      contact: contact,
      signature: signature
    }, callback);
  });
};

/**
 * Verifies the validity of the supplied signature
 * @private
 */
Network.prototype._verifySignature = function(options, callback) {
  /* jshint maxstatements: 20 */
  if (!options.signobj) {
    return callback(new Error('Invalid signature supplied'));
  }

  var signedmsg = Message(options.message.id + options.nonce);
  var magic = signedmsg.magicHash();
  var recovery = options.signobj.i;
  var sig = secp256k1.signatureImport(options.signobj.toBuffer());
  var pubKey = this._pubkeys[options.contact.nodeID];

  if (!pubKey) {
    try {
      pubKey = secp256k1.recover(magic, sig, recovery, true);
      this._pubkeys[options.contact.nodeID] = pubKey;
    } catch(e) {
      return callback(e);
    }
  }

  if (!secp256k1.verify(magic, sig, pubKey)) {
    return callback(new Error('Signature verification failed'));
  }

  if (!this._verifyHDKeyContact(options.contact, pubKey)) {
    return callback(new Error('Invalid derived public key'));
  }

  callback(null);
};

Network.prototype._verifyHDKeyContact = function(contact, publicKeyBuffer) {
  if (contact.hdKey) {
    var contactPub = this._hdcache[contact.hdKey + contact.hdIndex];
    if (!contactPub) {
      var hdKey = HDKey.fromExtendedKey(contact.hdKey);
      var nodeKey = hdKey.deriveChild(contact.hdIndex);
      contactPub = nodeKey.publicKey;
      this._hdcache[contact.hdKey + contact.hdIndex] = contactPub;
    }
    if (contactPub.compare(publicKeyBuffer) === 0) {
      return true;
    }
    return false;
  }
  return true;
};

/**
 * Creates a signature object from signature string
 * @private
 */
Network.prototype._createSignatureObject = function(signature) {
  var compactSig;
  var signobj;

  try {
    compactSig = new Buffer(signature, 'base64');
    signobj = bitcore.crypto.Signature.fromCompact(compactSig);
  } catch (err) {
    return null;
  }

  return signobj;
};

/**
 * Proxies error events from the underlying transport adapter
 * @private
 * @param {Error} error
 */
Network.prototype._handleTransportError = function(error) {
  this._logger.warn(error.message);
};

/**
 * Subscribe to tunneler opcodes to manage known tunnelers
 * @private
 */
Network.prototype._listenForTunnelers = function() {
  var self = this;
  var tunserver = self.transport.tunnelServer;
  var prefix = Buffer([constants.OPCODE_TUNNELER_PREFIX], 'hex');
  var available = Buffer([constants.OPCODE_DEG_LOW], 'hex');
  var unavailable = Buffer([constants.OPCODE_DEG_NULL], 'hex');

  function announce() {
    let hasTunnelAvailable = Object.keys(
      tunserver._proxies
    ).length < tunserver._opts.maxProxiesAllowed;
    self._pubsub.publish(
      Buffer.concat([
        prefix,
        hasTunnelAvailable ? available : unavailable
      ]).toString('hex'),
      self.contact
    );
    setTimeout(announce, constants.TUNNEL_ANNOUNCE_INTERVAL);
  }

  if (this._options.maxTunnels) {
    announce();
  }

  var tunUp = Buffer.concat([prefix, available]).toString('hex');
  var tunDown = Buffer.concat([prefix, unavailable]).toString('hex');

  this._pubsub.subscribe([tunUp, tunDown], function(contact, topic) {
    if (topic === tunUp) {
      if (!self._tunnelers.addContact(Contact(contact))) {
        self._tunnelers.removeContact(self._tunnelers.getContact(0));
        self._tunnelers.addContact(Contact(contact));
      }
    } else {
      self._tunnelers.removeContact(Contact(contact));
    }
  });
};

/**
 * Determines if tunnel is needed
 * @private
 * @param {Function} callback
 */
Network.prototype._setupTunnelClient = function(callback) {
  var self = this;

  if (this.transport._isPublic) {
    return callback(null);
  }

  var neighbors = this._options.seedList
    .filter(Contact.isValidUrl)
    .map(Contact.fromUrl)
    .filter((c) => c.nodeID !== self.contact.nodeID);

  function _discoverIfReachable() {
    self._logger.info('requesting probe from nearest neighbor');
    self._requestProbe(neighbors[0], function(err, result) {
      if (err || result.error) {
        return self._findTunnel(neighbors, callback);
      }

      self._logger.info(
        'you are publicly reachable, skipping tunnel establishment'
      );
      callback(null);
    });
  }

  if (!neighbors.length) {
    if (this._options.bridgeUri === null) {
      return callback(
        new Error('Could not find a neighbor to query for probe')
      );
    }

    return this.bridgeClient.getContactList({}, function(err, result) {
      if (err) {
        return callback(new Error('Failed to get seeds for probe'));
      }

      neighbors = result.map(function(c) {
        return new Contact(c);
      });

      _discoverIfReachable();
    });
  }

  _discoverIfReachable();
};

/**
 * Requests a probe from the nearest neighbor
 * @private
 */
Network.prototype._requestProbe = function(neighbor, callback) {
  var message = new kad.Message({
    method: 'PROBE',
    params: { contact: this.contact }
  });

  this.transport.send(neighbor, message, callback);
};

/**
 * Finds a potential tunneler
 * @private
 * @param {Array} neighbors
 * @param {Function} callback
 */
Network.prototype._findTunnel = function(neighbors, callback) {
  var self = this;
  var tunnelers = [];
  var message = new kad.Message({
    method: 'FIND_TUNNEL',
    params: {
      contact: this.contact,
      relayers: []
    }
  });

  // NB: If we are going to be tunneled, we better not accept any tunnel
  // NB: connections from other nodes, so let's override our maxTunnels.
  this._options.maxTunnels = 0;
  this.transport.tunnelServer._opts.maxProxiesAllowed = 0;

  if (!neighbors.length) {
    return callback(
      new Error('Could not find a neighbor to query for tunnels')
    );
  }

  async.detectSeries(neighbors, function(neighbor, callback) {
    self._logger.info('requesting tunnelers from neighbor');
    self.transport.send(neighbor, message, function(err, resp) {
      if (err) {
        return callback(null, false);
      }

      if (!resp.result.tunnels.length) {
        return callback(null, false);
      }

      tunnelers = tunnelers.concat(resp.result.tunnels).filter(
        t => t.nodeID !== self.contact.nodeID
      );

      callback(null, true);
    });
  }, function() {
    if (!tunnelers.length) {
      return callback(
        new Error('Failed to find tunnels from neighbors')
      );
    }

    self._establishTunnel(tunnelers, callback);
  });
};

/**
 * Creates a tunnel to a public node
 * @private
 * @param {Function} callback
 */
Network.prototype._establishTunnel = function(tunnels, callback) {
  var self = this;
  var remoteAddress, remotePort, proxyPort;

  function established() {
    return proxyPort && remotePort && remoteAddress;
  }

  function openTunnel(done) {
    if (!tunnels.length) {
      return done(new Error('No tunnelers were returned'));
    }

    var tun = new Contact(tunnels[0]);
    var msg = kad.Message({
      method: 'OPEN_TUNNEL',
      params: { contact: self.contact }
    });

    tunnels.shift();
    self.transport.send(tun, msg, function(err, resp) {
      if (err) {
        return done();
      }

      remoteAddress = tun.address;
      remotePort = tun.port;
      proxyPort = resp.result.proxyPort;
      done();
    });
  }

  async.until(established, openTunnel, function(err) {
    if (err) {
      return callback(
        new Error('Failed to establish tunnel, reason: ' + err.message)
      );
    }

    var tunnelWasOpened = false;
    var tunnelDidError = false;
    var localAddress = self.transport._server.address();

    if (!localAddress) {
      return callback(new Error(
        'Local transport not initialized, refusing to establish new tunnel'
      ));
    }

    self._tunnelClient = new diglet.Tunnel({
      localAddress: 'localhost',
      localPort: localAddress.port,
      remoteAddress: remoteAddress,
      remotePort: proxyPort,
      logger: self._logger
    });

    self._tunnelClient.once('established', () => {
      self._logger.info('tunnel successfully established');

      tunnelWasOpened = true;
      self.contact.address = remoteAddress;
      self.contact.port = remotePort;

      callback();
    });

    self._tunnelClient.on('error', function onTunnelError(err) {
      /* istanbul ignore else */
      if (!tunnelDidError) {
        tunnelDidError = true;

        self._logger.warn(
          'tunnel connection lost, reason: %s',
          err.message
        );
        self._establishTunnel(tunnels, tunnelWasOpened ? utils.noop : callback);
      } else {
        self._logger.debug(
          'stale tunnel client encountered an error: %s, ignoring',
          err.message
        );
      }
    });

    self._tunnelClient.open();
  });
};

/**
 * Cleans invalid contacts from routing table
 * @private
 */
Network.prototype._cleanRoutingTable = function() {
  var dropped = [];

  for (var k in this.router._buckets) {
    var bucket = this.router._buckets[k];
    var bucketList = bucket.getContactList();

    for (var i = 0; i < bucketList.length; i++) {
      var isValidContact = utils.isValidContact(
        bucketList[i],
        process.env.STORJ_ALLOW_LOOPBACK
      );
      var isValidProtocol = utils.isCompatibleVersion(bucketList[i].protocol);

      if (!isValidContact || !isValidProtocol) {
        dropped.push(bucketList[i]);
        bucket.removeContact(bucketList[i]);
      }
    }
  }

  return dropped;
};

/**
 * Cleans the routing table on an interval
 * @private
 */
Network.prototype._startRouterCleaner = function() {
  var self = this;

  setInterval(function() {
    self._logger.debug('cleaning bad contacts from routing table');
    var dropped = self._cleanRoutingTable();
    self._logger.debug('dropping %s bad contacts from router', dropped.length);
  }, constants.ROUTER_CLEAN_INTERVAL);
};

/**
 * Resets the countdown until network re-entry due to inactivity
 * @private
 */
Network.prototype._updateActivityCounter = function() {
  clearTimeout(this._reentranceCountdown);

  this._reentranceCountdown = setTimeout(
    this._enterOverlay.bind(this, utils.noop),
    constants.NET_REENTRY
  );
};

/**
 * Warns the user if their clock is not synchronized with NTP server
 * @private
 */
Network.prototype._warnIfClockNotSynced = function(callback) {
  var self = this;

  utils.ensureNtpClockIsSynchronized(function(err, delta) {
    if (err) {
      self._logger.warn(err.message);
    } else {
      self._logger.info('clock is synchronized with ntp, delta: %s', delta);
    }

    callback(null);
  });
};

module.exports = Network;
