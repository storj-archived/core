'use strict';

var platform = require('os').platform();
var path = require('path');
var url = require('url');
var assert = require('assert');
var merge = require('merge');
var async = require('async');
var kad = require('kad');
var bitcore = require('bitcore-lib');
var constants = require('../constants');
var Message = require('bitcore-message');
var Quasar = require('kad-quasar');
var KeyPair = require('../keypair');
var Contract = require('../contract');
var Protocol = require('./protocol');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USER_PROFILE;

/**
 * Storj network interface
 * @constructor
 * @param {KeyPair} keypair
 * @param {Object} options
 */
function Network(keypair, options) {
  if (!(this instanceof Network)) {
    return new Network(keypair, options);
  }

  assert(keypair instanceof KeyPair, 'Invalid keypair supplied');

  this._keypair = keypair;
  this._options = merge(Object.create(Network.DEFAULTS), options);
  this._logger = new kad.Logger(this._options.loglevel, 'storjnode');
  this._contact = new kad.contacts.AddressPortContact(
    merge(this._options.contact, { nodeID: this._keypair.getNodeID() })
  );
  this._transport = new kad.transports.TCP(this._contact, {
    logger: this._logger
  });
  this._router = new kad.Router({
    transport: this._transport,
    logger: this._logger
  });
  this._pubsub = new Quasar(this._router);

  if (this._options.datadir) {
    this._storage = new kad.storage.FS(this._options.datadir);
  } else {
    this._storage = new kad.storage.MemStore();
  }

  this._open = false;
}

Network.DEFAULTS = {
  loglevel: 3,
  seeds: [
    'storj://127.0.0.1:4001/02b60f4fc7934f95dca1c00186a09f01653a593d',
    'storj://127.0.0.1:4002/a09d63dea0bd1e9856d6824181bce100ff44c013',
    'storj://127.0.0.1:4003/de3bb839a705d26f6abc6885d07c813748b4f128',
  ],
  datadir: path.join(HOME, '.storjnode'),
  contact: {
    address: '127.0.0.1',
    port: 4000,
  }
};

/**
 * Opens the connection to the network
 * @param {Function} callback
 */
Network.prototype.open = function(callback) {
  var seeds = this._options.seeds.map(this._createContact);

  assert(!this._open, 'Network interface already open');

  this._transport.on('error', this._handleTransportError.bind(this));
  this._transport.before('serialize', this._signMessage.bind(this));
  this._transport.before('receive', this._verifyMessage.bind(this));
  this._transport.before('receive', new Protocol(this));

  this._node = new kad.Node({
    transport: this._transport,
    router: this._router,
    storage: this._storage,
    logger: this._logger
  });

  this._open = true;

  async.each(seeds, this._node.connect, callback);
};

/**
 * Connects to the node at the given URI
 * @param {String} uri
 * @param {Function} callback
 */
Network.prototype.connect = function(uri, callback) {
  return this._node.connect(this._createContact(uri), callback);
};

/**
 * Stores an item in the DHT
 * @param {Buffer} item
 * @param {Function} callback
 */
Network.prototype.store = function(item, callback) {
  return this._node.put(
    bitcore.crypto.Hash.sha256sha256(item),
    item.toJSON(),
    callback
  );
};

/**
 * Fetches an item from the DHT
 * @param {String} key
 * @param {Function} callback
 */
Network.prototype.fetch = function(key, callback) {
  return this._node.get(key, callback);
};

/**
 * Publishes a contract to the network
 * @param {String} identifier
 * @param {Contract} contract
 */
Network.prototype.publish = function(identifier, contract) {
  assert(contract instanceof Contract, 'Invalid contract supplied');
  return this._pubsub.publish(identifier, contract);
};

/**
 * Subscribes to a contract identifier on the network
 * @param {String} identifier
 * @param {Function} handler
 */
Network.prototype.subscribe = function(identifier, handler) {
  return this._pubsub.subscribe(identifier, function(contract) {
    handler(Contract.fromObject(contract));
  });
};

/**
 * Returns a Storj contact from the URI
 * @private
 * @param {String} uri
 */
Network.prototype._createContact = function(uri) {
  var parsed = url.parse(uri);

  return new kad.contacts.AddressPortContact({
    address: parsed.address,
    port: parsed.port,
    nodeID: parsed.pubkey.substr(1)
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
    message.params.__nonce = nonce;
    message.params.__signature = signature;
  } else {
    message.result.__nonce = nonce;
    message.result.__signature = signature;
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
  var nonce, target, signature, address;

  if (kad.Message.isRequest(message)) {
    nonce = message.params.__nonce;
    signature = message.params.__signature;
  } else {
    nonce = message.result.__nonce;
    signature = message.result.__signature;
  }

  if (Date.now() > (constants.NONCE_EXPIRE + nonce)) {
    return callback(new Error('Message signature expired'));
  }

  target = message.id + nonce;
  address = bitcore.Address.fromPublicKeyHash(Buffer(contact.nodeID, 'hex'));

  if (!Message(target).verify(address, signature)) {
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

module.exports = Network;
module.exports.Protocol = Protocol;
