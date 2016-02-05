'use strict';

var assert = require('assert');
var kad = require('kad');
var inherits = require('util').inherits;
var net = require('net');
var es = require('event-stream');
var KeyPair = require('../keypair');
var ECIES = require('bitcore-ecies');

/**
* Defines the end-to-end encrypted RPC interface
* @constructor
* @param {kad.Contact} contact
* @param {Object} options
*/
function EncryptedTransport(contact, options) {
  if (!(this instanceof EncryptedTransport)) {
    return new EncryptedTransport(contact, options);
  }

  assert(options.keypair instanceof KeyPair, 'Invalid keypair supplied');
  kad.RPC.call(this, contact, options);

  this._keypair = options.keypair;
  this._pubkeys = {};
  this._queuedResponses = {};
}

inherits(EncryptedTransport, kad.RPC);

/**
* Opens a TCP socket and sets up event listeners
* @param {Function} ready
*/
EncryptedTransport.prototype._open = function(ready) {
  var self = this;

  this._socket = net.createServer(this._handleConnection.bind(this));

  this._socket.on('error', function(err) {
    self._log.error('rpc encountered and error: %s', err.message);
  });

  this._socket.on('listening', ready).listen(
    this._contact.port,
    this._contact.address
  );
};

/**
* Send a RPC to the given contact
* @param {Buffer} data
* @param {kad.Contact} contact
*/
EncryptedTransport.prototype._send = function(data, contact) {
  var self = this;
  var parsed = JSON.parse(data.toString());
  var encrypter = new ECIES().privateKey(self._keypair._privkey);
  var message = null;

  try {
    encrypter.publicKey(this._pubkeys[contact.nodeID]);
    message = encrypter.encrypt(data);
  } catch (err) {
    self._logger.warn('failed to encrypt message, will send as cleartext');
    message = data;
  }

  if (this._queuedResponses[parsed.id]) {
    this._queuedResponses[parsed.id].end(data);
    return delete this._queuedResponses[parsed.id];
  }

  var sock = net.createConnection(contact.port, contact.address);

  sock.on('error', function(err) {
    self._log.error('error connecting to peer', err);
  });

  this._queuedResponses[parsed.id] = sock;
  this._handleConnection(sock);
  sock.write(data);
};

/**
 * Handle incoming connection stream
 * @private
 * @param {net.Socket} connection
 */
EncryptedTransport.prototype._handleConnection = function(connection) {
  var self = this;

  var chunks = connection.pipe(es.split('\n'));
  var messages = chunks.pipe(es.map(function(chunk, callback) {
    var decrypter = new ECIES({
      noKey: true
    }).privateKey(self._keypair._privkey);

    try {
      callback(null, decrypter.decrypt(chunk));
    } catch (err) {
      self._logger.warn('failed to decrypt message, will parse as cleartext');
      callback(null, chunk);
    }
  }));

  messages.on('data', function(clearbuffer) {
    self.receive(clearbuffer);
  });

  messages.on('error', function(err) {
    self._log.error('error decrypting message, reason:', err.message);
    self.receive(null);
  });
};

/**
* Closes the underlying TCP socket
*/
EncryptedTransport.prototype._close = function() {
  this._socket.close();
};

module.exports = EncryptedTransport;
