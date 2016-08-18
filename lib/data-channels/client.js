'use strict';

var WebSocketClient = require('ws');
var assert = require('assert');
var events = require('events');
var inherits = require('util').inherits;
var url = require('url');
var DataChannelPointer = require('./pointer');
var WritableDataChannelStream = require('./writable-stream');
var ReadableDataChannelStream = require('./readable-stream');

/**
 * Creates a data channel client for sending and receiving consigned file shards
 * @constructor
 * @license LGPL-3.0
 * @param {Object} contact
 * @param {String} contact.address - The address of the target farmer
 * @param {Number} contact.port - The port of the target farmer
 */
function DataChannelClient(contact) {
  if (!(this instanceof DataChannelClient)) {
    return new DataChannelClient(contact);
  }

  assert.ok(contact, 'No contact was supplied to constructor');
  assert(typeof contact.address === 'string', 'Invalid contact address');
  assert(typeof contact.port === 'number', 'Invalid contact port');

  events.EventEmitter.call(this);

  this.contact = contact;
  this._client = new WebSocketClient(DataChannelClient.getChannelURL(contact));

  this._client.on('open', this._handleChannelOpen.bind(this));
  this._client.on('error', this._handleChannelError.bind(this));
}

/**
 * Triggered when the connection is opened
 * @event DataChannelClient#open
 */

/**
 * Triggered when a error occurs
 * @event DataChannelClient#error
 * @param {Error} error - The error object
 */

inherits(DataChannelClient, events.EventEmitter);

/**
 * Creates a readable stream from the remote farmer for retrieval of a shard
 * @param {String} token - The RETRIEVE token supplied by the farmer
 * @param {String} hash - The hash of the data to retrieve
 * @returns {stream.Readable}
 */
DataChannelClient.prototype.createReadStream = function(token, hash) {
  return new ReadableDataChannelStream(this, token, hash);
};

/**
 * Creates a writable stream from the remote farmer for consignment of a shard
 * @param {String} token - The CONSIGN token supplied by the farmer
 * @param {String} hash - The hash of the data to consign
 * @returns {WritableDataChannelStream}
 */
DataChannelClient.prototype.createWriteStream = function(token, hash) {
  return new WritableDataChannelStream(this, token, hash);
};

/**
 * Handles the open event from the underlying client
 * @private
 */
DataChannelClient.prototype._handleChannelOpen = function() {
  this.emit('open');
};

/**
 * Handles the open event from the underlying client
 * @private
 */
DataChannelClient.prototype._handleChannelError = function(err) {
  this.emit('error', err);
};

/**
 * Returns the URI of the contact's data channel
 * @static
 * @param {Object} contact
 */
DataChannelClient.getChannelURL = function(contact) {
  return url.format({
    protocol: 'ws',
    slashes: true,
    hostname: contact.address.trim(),
    port: contact.port
  });
};

/**
 * Creates a Readable or Writable stream from a {@link DataChannelPointer}
 * @static
 * @param {DataChannelPointer} pointer - The pointer to create stream
 * @param {DataChannelClient~getStreamFromPointerCallback} callback
 */
DataChannelClient.getStreamFromPointer = function(pointer, callback) {
  assert(pointer instanceof DataChannelPointer, 'Invalid pointer supplied');

  var dcx = new DataChannelClient(pointer.farmer);

  dcx.on('error', callback).on('open', function() {
    dcx.removeAllListeners('error');

    if (pointer.operation === 'PUSH') {
      callback(null, dcx.createWriteStream(pointer.token, pointer.hash));
    } else {
      callback(null, dcx.createReadStream(pointer.token, pointer.hash));
    }
  });

  return dcx;
};
/**
 * This callback is called when the client is open and stream is created
 * @callback DataChannelClient~getStreamFromPointerCallback
 * @param {Error|null} err - If opening client failed, an error object
 * @param {stream.Writable|stream.Readable} stream - The data channel stream
 */

module.exports = DataChannelClient;
