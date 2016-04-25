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
var KeyPair = require('../keypair');
var Manager = require('../manager');
var Protocol = require('./protocol');
var Contact = require('./contact');
var Transport = require('./transport');
var DataChannelServer = require('../datachannel/server');
var TunnelClient = require('../tunnel/client');

/**
 * Storj network interface
 * @constructor
 * @param {Object}  options
 * @param {KeyPair} options.keypair - Node's cryptographic identity
 * @param {Manager} options.manager - Persistence management interface
 * @param {Object}  options.logger - Optional logger override
 * @param {Array}   options.seeds - List of seed URIs to join
 * @param {String}  options.address - Public node IP or hostname
 * @param {Number}  options.port - Listening port for RPC
 * @param {Array}   options.opcodes - List of topic strings to subscribe
 * @param {Boolean} options.noforward - Flag for skipping traversal strategies
 * @param {Number}  options.tunnels - Max number of tunnels to provide
 * @param {Number}  options.tunport - Port for tunnel server to use
 */
function Network(options) {
  if (!(this instanceof Network)) {
    return new Network(options);
  }

  this._pendingContracts = {};
  this._keypair = options.keypair;
  this._manager = options.manager;
  this._tunnelers = kad.Bucket();
  this._options = this._checkOptions(options);
  this._logger = options.logger || new kad.Logger(3, 'STORJ');
  this._storage = new kad.storage.MemStore();
  this._pubkeys = {};
  this._open = false;

  this._initNetworkInterface();
}

Network.DEFAULTS = {
  seeds: [
    'storj://api.storj.io:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052'
  ],
  address: '127.0.0.1',
  port: 4000,
  noforward: false,
  tunnels: 3,
  tunport: 0 // NB: Pick random open port
};

/**
 * Check the options supplied to the constructor
 * @private
 */
Network.prototype._checkOptions = function(options) {
  assert(options.keypair instanceof KeyPair, 'Invalid keypair supplied');
  assert(options.manager instanceof Manager, 'Invalid manager supplied');

  return merge(Object.create(Network.DEFAULTS), options);
};

/**
 * Opens the connection to the network
 * @param {Function} callback - Called on successful network join
 */
Network.prototype.join = function(callback) {
  var self = this;
  var seeds = this._options.seeds.map(this._createContact);

  assert(!this._open, 'Network interface already open');

  this._transport.on('error', this._handleTransportError.bind(this));
  this._transport.before('serialize', this._signMessage.bind(this));
  this._transport.before('receive', this._verifyMessage.bind(this));
  this._transport.before('receive', kad.hooks.protocol(
    this._protocol.handlers()
  ));

  this._node = new kad.Node({
    transport: this._transport,
    router: this._router,
    storage: this._storage,
    logger: this._logger
  });

  this._open = true;

  async.each(seeds, function(contact, next) {
    self._node.connect(contact, function(err) {
      if (err) {
        self._logger.warn('failed to connect to seed %j', contact);
      }
    });
    next();
  }, function() {
    self._listenForTunnelers();
    self._setupTunnelClient();
    callback(null, self);
  });
};

/**
 * Disconnects from the network
 * @param {Function} callback - Called when successful disconnect
 */
Network.prototype.leave = function(callback) {
  this._node.disconnect(callback);
};

/**
 * Publishes a topic with content to the network
 * @param {String} topic - The serialized opcode topic
 * @param {Object} contents - Arbitrary publication contents
 */
Network.prototype.publish = function(topic, contents) {
  return this._pubsub.publish(topic, contents);
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
 * Initilizes the network interface
 * @private
 */
Network.prototype._initNetworkInterface = function() {
  this._protocol = new Protocol({ network: this });
  this._contact = new Contact({
    address: this._options.address,
    port: this._options.port,
    nodeID: this._keypair.getNodeID()
  });
  this._transport = new Transport(this._contact, {
    logger: this._logger,
    cors: true,
    tunnels: this._options.tunnels,
    tunport: this._options.tunport,
    noforward: this._options.noforward
  });
  this._router = new kad.Router({
    transport: this._transport,
    logger: this._logger
  });
  this._pubsub = new Quasar(this._router, {
    logger: this._logger
  });
  this._transport.after('open', this._onTransportOpen.bind(this));
};

/**
 * Set up {@link DataChannelServer} after transport is ready
 * @private
 */
Network.prototype._onTransportOpen = function() {
  this._channel = new DataChannelServer({
    transport: this._transport,
    manager: this._manager,
    logger: this._logger
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
  if (!utils.isCompatibleVersion(contact.protocol)) {
    return callback(new Error('Protocol version is incompatible'));
  }

  var messagekey = kad.Message.isRequest(message) ? 'params' : 'result';
  var nonce = message[messagekey].nonce;
  var signature = message[messagekey].signature;

  if (Date.now() > (constants.NONCE_EXPIRE + nonce)) {
    return callback(new Error('Message signature expired'));
  }

  var addr = bitcore.Address.fromPublicKeyHash(Buffer(contact.nodeID, 'hex'));
  var signobj = this._createSignatureObject(signature);

  if (!signobj) {
    return callback(new Error('Invalid signature supplied'));
  }

  this._verifySignature({
    message: message,
    nonce: nonce,
    signobj: signobj,
    address: addr,
    contact: contact,
    signature: signature
  }, callback);
};

/**
 * Verifies the validity of the supplied signature
 * @private
 */
Network.prototype._verifySignature = function(options, callback) {
  var signedmsg = Message(options.message.id + options.nonce);
  var ecdsa = new bitcore.crypto.ECDSA();

  ecdsa.hashbuf = signedmsg.magicHash();
  ecdsa.sig = options.signobj;

  this._pubkeys[options.contact.nodeID] = ecdsa.toPublicKey();

  if (!signedmsg.verify(options.address, options.signature)) {
    return callback(new Error('Signature verification failed'));
  }

  callback();
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
  var prefix = Buffer([constants.OPCODE_TUNNELER_PREFIX], 'hex');
  var available = Buffer([constants.OPCODE_DEG_LOW], 'hex');
  var unavailable = Buffer([constants.OPCODE_DEG_NULL], 'hex');

  if (this._options.tunnels) {
    self._pubsub.publish(
      Buffer.concat([prefix, available]).toString('hex'),
      self._contact
    );
  }

  this._transport._tunserver.on('locked', function() {
    self._pubsub.publish(
      Buffer.concat([prefix, unavailable]).toString('hex'),
      self._contact
    );
  });

  this._transport._tunserver.on('unlocked', function() {
    self._pubsub.publish(
      Buffer.concat([prefix, available]).toString('hex'),
      self._contact
    );
  });

  this._pubsub.subscribe(
    Buffer.concat([prefix, available]).toString('hex'),
    function(contact) {
      if (self._tunnelers.getSize() < kad.constants.K) {
        self._tunnelers.addContact(kad.contacts.AddressPortContact(contact));
      }
    }
  );

  this._pubsub.subscribe(
    Buffer.concat([prefix, unavailable]).toString('hex'),
    function(contact) {
      self._tunnelers.removeContact(kad.contacts.AddressPortContact(contact));
    }
  );
};

/**
 * Determines if tunnel is needed
 * @private
 */
Network.prototype._setupTunnelClient = function() {
  var self = this;
  var neighbor = this._options.seeds.length ?
                 this._createContact(this._options.seeds[0]) :
                 null;

  if (!neighbor) {
    return this._logger.error('could not find a neighbor to query for probe');
  }

  this._logger.info('requesting probe from nearest neighbor');
  this._requestProbe(neighbor, function(err, result) {
    if (err || result.error) {
      return self._findTunnel(neighbor);
    }

    self._logger.info(
      'you are publicly reachable, skipping tunnel establishment'
    );
  });
};

/**
 * Requests a probe from the nearest neighbor
 * @private
 */
Network.prototype._requestProbe = function(neighbor, callback) {
  var message = new kad.Message({
    method: 'PROBE',
    params: { contact: this._contact }
  });

  this._transport.send(neighbor, message, callback);
};

/**
 * Finds a potential tunneler
 * @private
 */
Network.prototype._findTunnel = function(neighbor) {
  var self = this;
  var message = new kad.Message({
    method: 'FIND_TUNNEL',
    params: { contact: this._contact }
  });

  if (!neighbor) {
    return this._logger.error('could not find a neighbor to query for tunnels');
  }

  this._logger.info('requesting tunnelers from nearest neighbor');
  this._transport.send(neighbor, message, function(err, resp) {
    if (err) {
      return self._logger.error(
        'failed to find tunnels, reason: %s',
        err.message
      );
    }

    self._establishTunnel(resp.result.tunnels);
  });
};

/**
 * Creates a tunnel to a public node
 * @private
 */
Network.prototype._establishTunnel = function(tunnels) {
  var self = this;
  var tunnel = null;
  var alias = null;

  function established() {
    return tunnel && alias;
  }

  function openTunnel(callback) {
    if (!tunnels.length) {
      callback(new Error('No tunnelers were returned'));
    }

    var tun = new Contact(tunnels[0]);
    var msg = kad.Message({
      method: 'OPEN_TUNNEL',
      params: { contact: self._contact }
    });

    tunnels.unshift();
    self._transport.send(tun, msg, function(err, resp) {
      if (err) {
        return callback();
      }

      tunnel = resp.result.tunnel;
      alias = resp.result.alias;

      callback();
    });
  }

  async.until(established, openTunnel, function(err) {
    if (err) {
      return self._logger.error(
        'failed to establish tunnel, reason: %s',
        err.message
      );
    }

    var local = 'http://127.0.0.1:' + self._transport._server.address().port;
    var tunclient = new TunnelClient(tunnel, local);

    tunclient.on('open', function() {
      self._logger.info('tunnel successfully established: %j', alias);
      self._contact.address = alias.address;
      self._contact.port = alias.port;
    });

    tunclient.on('close', function onTunnelClosed(code, message) {
      self._logger.warn(
        'tunnel connection closed: %s / %s',
        code,
        message
      );
      self._establishTunnel(tunnels);
    });

    tunclient.on('error', function onTunnelError(err) {
      self._logger.warn(
        'tunnel connection lost, reason: %s',
        err.message
      );
      self._establishTunnel(tunnels);
    });

    tunclient.open();
  });
};

module.exports = Network;
