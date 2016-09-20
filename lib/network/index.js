'use strict';

var url = require('url');
var assert = require('assert');
var merge = require('merge');
var async = require('async');
var kad = require('kad');
var bitcore = require('bitcore-lib');
var constants = require('../constants');
var Message = require('bitcore-message');
var Quasar = require('kad-quasar').Protocol;
var utils = require('../utils');
var KeyPair = require('../crypto-tools/keypair');
var StorageManager = require('../storage/manager');
var Protocol = require('./protocol');
var Contact = require('./contact');
var Transport = require('./transport');
var DataChannelServer = require('../data-channels/server');
var TunnelClient = require('../tunnel/client');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var RateLimiter = require('./rate-limiter');
var ms = require('ms');
var shuffle = require('knuth-shuffle').knuthShuffle;
var BridgeClient = require('../bridge-client');
var ContactChecker = require('./contact-checker');
var TriggerManager = require('../sips').SIP0003.TriggerManager;

/**
 * Storj network interface
 * @constructor
 * @license AGPL-3.0
 * @param {Object}  options
 * @param {KeyPair} options.keyPair - Node's cryptographic identity
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {String}  options.bridgeUri - URL for bridge server seed lookup
 * @param {Object}  options.logger - Logger instance
 * @param {Array}   options.seedList - List of seed URIs to join
 * @param {String}  options.rpcAddress - Public node IP or hostname
 * @param {Number}  options.rpcPort - Listening port for RPC
 * @param {Boolean} options.doNotTraverseNat - Skip NAT traversal strategies
 * @param {Number}  options.maxTunnels - Max number of tunnels to provide
 * @param {Number}  options.tunnelServerPort - Port for tunnel server to use
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  options.tunnelGatewayRange.min - Min port for gateway bind
 * @param {Number}  options.tunnelGatewayRange.max - Max port for gateway bind
 * @param {Object}  options.rateLimiterOpts - Options for {@link RateLimiter}
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
function Network(options) {
  if (!(this instanceof Network)) {
    return new Network(options);
  }

  this.keyPair = options.keyPair;
  this.storageManager = options.storageManager;

  this._pendingContracts = {};
  this._tunnelers = kad.Bucket();
  this._options = this._checkOptions(options);
  this._logger = options.logger;
  this._storage = new kad.storage.MemStore();
  this._pubkeys = {};
  this._open = false;

  this._initNetworkInterface();
}

inherits(Network, EventEmitter);

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
 * @param {Contract} contract - The complete contract, signed by us and farmer
 * @param {Contact} contact - The farmer contact the offer is from
 * @param {Protocol~unhandledOfferResolver}
 */

/**
 * Triggered when an unhandled offer is handled by the
 * {@link Network#unhandledOffer} listener by calling the event's supplied
 * {@link Network~unhandledOfferResolver}
 * @event Network#unhandledOfferResolved
 * @param {Contract} contract - The complete contract, signed by us and farmer
 */

Network.DEFAULTS = {
  bridgeUri: 'https://api.storj.io',
  seedsList: [],
  rpcAddress: '127.0.0.1',
  rpcPort: 4000,
  doNotTraverseNat: false,
  maxTunnels: 3,
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
  assert(options.keyPair instanceof KeyPair, 'Invalid keypair supplied');
  assert(
    options.storageManager instanceof StorageManager,
    'Invalid manager supplied'
  );
  assert.ok(this._validateLogger(options.logger), 'Invalid logger supplied');

  return merge(Object.create(Network.DEFAULTS), options);
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
  this.transport.before('receive', this._checkRateLimiter.bind(this));
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

      self._enterOverlay(onJoinComplete);
    }
  );
};

/**
 * Iteratively attempt connection to network via supplied seeds
 * @private
 */
Network.prototype._enterOverlay = function(callback) {
  var self = this;

  function _trySeeds() {
    async.detectSeries(self._options.seedList, function(uri, next) {
      self._logger.info('attempting to join network via %s', uri);
      self.connect(uri, function(err) {
        if (err) {
          self._logger.warn('failed to connect to seed %s', uri);
          next(false);
        } else {
          self._logger.info('connected to the storj network via %s', uri);
          next(true);
        }
      });
    }, function(result) {
      if (!result) {
        return callback(new Error('Failed to join the network'));
      }

      callback(null);
    });
  }

  if (this._options.seedList.length) {
    return _trySeeds();
  }

  if (this._options.bridgeUri === null) {
    self._logger.warn('no bridge uri or seeds provided, not connected');
    return callback(null);
  }

  this._logger.info('resolving seeds from %s', this._options.bridge);
  this.bridgeClient.getContactList({ connected: true }, function(err, seeds) {
    if (err) {
      return callback(
        new Error('Failed to discover seeds from bridge: ' + err.message)
      );
    }

    self._options.seedList = shuffle(seeds).map(utils.getContactURL);

    _trySeeds();
  });
};

/**
 * Disconnects from the network
 * @param {Function} callback - Called when successful disconnect
 */
Network.prototype.leave = function(callback) {
  var self = this;

  if (self._tunnelClient &&
      self._tunnelClient.readyState === TunnelClient.OPEN) {
    self._tunnelClient.removeAllListeners();
    self._tunnelClient.close();
  }

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
  return this.node.connect(this._createContact(uri), callback);
};

/**
 * Returns a Storj contact from the URI
 * @private
 * @param {String} uri
 */
Network.prototype._createContact = function(uri) {
  var parsed = url.parse(uri);

  return new Contact({
    address: parsed.hostname,
    port: Number(parsed.port),
    nodeID: parsed.path.substr(1)
  });
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
    nodeID: this.keyPair.getNodeID()
  });
  this.transport = new Transport(this.contact, {
    logger: this._logger,
    cors: true,
    maxTunnels: this._options.maxTunnels,
    tunnelServerPort: this._options.tunnelServerPort,
    tunnelGatewayRange: this._options.tunnelGatewayRange,
    doNotTraverseNat: this._options.doNotTraverseNat
  });
  this.router = new kad.Router({
    transport: this.transport,
    logger: this._logger
  });

  this._protocol = new Protocol({ network: this });
  this._rateLimiter = new RateLimiter(this._options.rateLimiterOpts);

  this.transport.after('open', this._onTransportOpen.bind(this));
  this._startRouterCleaner();
};

/**
 * Checks the rate limiter and updates it appropriately
 * @private
 */
Network.prototype._checkRateLimiter = function(message, contact, next) {
  if (kad.Message.isResponse(message)) {
    return next(); // NB: Ignore rate limiter if this is a response message
  }

  if (!this._rateLimiter.isLimited(contact.nodeID)) {
    this._rateLimiter.updateCounter(contact.nodeID);
    return next();
  }

  var timeLeft = ms(this._rateLimiter.getResetTime());
  var response = new kad.Message({
    id: message.id,
    result: {},
    error: new Error('Rate limit exceeded, please wait ' + timeLeft)
  });

  this.transport.send(contact, response);
};

/**
 * Set up {@link DataChannelServer} after transport is ready
 * @private
 */
Network.prototype._onTransportOpen = function() {
  this._bindTransportHooks();

  this._ready = true;
  this.dataChannelServer = new DataChannelServer({
    server: this.transport._server,
    storageManager: this.storageManager,
    logger: this._logger
  });
  this._pubsub = new Quasar(this.router, {
    logger: this._logger,
    randomRelay: true
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
  if (!options.signobj) {
    return callback(new Error('Invalid signature supplied'));
  }

  var signedmsg = Message(options.message.id + options.nonce);
  var ecdsa = new bitcore.crypto.ECDSA();

  ecdsa.hashbuf = signedmsg.magicHash();
  ecdsa.sig = options.signobj;

  try {
    this._pubkeys[options.contact.nodeID] = ecdsa.toPublicKey();
  } catch (err) {
    return callback(err);
  }

  if (!signedmsg.verify(options.address, options.signature)) {
    return callback(new Error('Signature verification failed'));
  }

  callback(null);
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
  this._logger.error(error.message);
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
    self._pubsub.publish(
      Buffer.concat([
        prefix,
        tunserver.hasTunnelAvailable() ? available : unavailable
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

  var neighbors = this._options.seedList.map(this._createContact);

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

    return this.bridgeClient.getInfo(function(err, result) {
      if (err) {
        return callback(new Error('Failed to get seeds for probe'));
      }

      neighbors = result.info['x-network-seeds'].map(self._createContact);

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
  this.transport.tunnelServer._options.maxTunnels = 0;

  if (!neighbors.length) {
    return callback(
      new Error('Could not find a neighbor to query for tunnels')
    );
  }

  async.detectSeries(neighbors, function(neighbor, callback) {
    self._logger.info('requesting tunnelers from neighbor');
    self.transport.send(neighbor, message, function(err, resp) {
      if (err) {
        return callback(false);
      }

      if (!resp.result.tunnels.length) {
        return callback(false);
      }

      tunnelers = tunnelers.concat(resp.result.tunnels);

      callback(true);
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
  var tunnel = null;
  var alias = null;

  function established() {
    return tunnel && alias;
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

      tunnel = resp.result.tunnel;
      alias = resp.result.alias;

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
    var localAddress = self.transport._server.address();

    if (!localAddress) {
      return callback(new Error(
        'Local transport not initialized, refusing to establish new tunnel'
      ));
    }

    self._tunnelClient = new TunnelClient(
      tunnel,
      'http://127.0.0.1:' + localAddress.port,
      { logger: self._logger }
    );

    self._tunnelClient.on('open', function() {
      self._logger.info('tunnel successfully established: %j', alias);

      self.contact.address = alias.address;
      self.contact.port = alias.port;

      self._logger.info('testing newly established tunnel: %j', alias);

      ContactChecker().check(self.contact, function(err) {
        if (err) {
          self._logger.warn('tunnel test failed, establishing new tunnel');
          return self._tunnelClient.close();
        }

        tunnelWasOpened = true;

        callback();
      });
    });

    self._tunnelClient.on('close', function onTunnelClosed() {
      self._logger.warn('tunnel connection closed');
      self._tunnelClient.removeAllListeners('error');
      self._establishTunnel(tunnels, tunnelWasOpened ? utils.noop : callback);
    });

    self._tunnelClient.on('error', function onTunnelError(err) {
      self._logger.warn(
        'tunnel connection lost, reason: %s',
        err.message
      );
      self._tunnelClient.removeAllListeners();
      self._establishTunnel(tunnels, tunnelWasOpened ? utils.noop : callback);
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
