'use strict';

var BinaryClient = require('binaryjs').BinaryClient;
var assert = require('assert');
var events = require('events');
var inherits = require('util').inherits;
var url = require('url');
var utils = require('../utils');

/**
 * Creates a data channel client for sending and receiving consigned file shards
 * @constructor
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

  this._contact = contact;
  this._client = new BinaryClient(DataChannelClient.getChannelURL(contact));

  this._client.on('open', this._handleChannelOpen.bind(this));
  this._client.on('error', this._handleChannelError.bind(this));
}

inherits(DataChannelClient, events.EventEmitter);

/**
 * Creates a Readable Stream for the token and hash that receives the data
 * @param {String} token - The RETRIEVE token supplied by the farmer
 * @param {String} hash - The hash of the data to retrieve
 * @returns {stream.Readable}
 */
DataChannelClient.prototype.retrieve = function(token, hash) {
  var channel = this._client.send(null, {
    token: token,
    hash: hash,
    operation: 'PULL'
  });

  return channel;
};

/**
 * Creates a Writable Stream for the token and hash that stores the data
 * @param {String} token - The CONSIGN token supplied by the farmer
 * @param {Buffer} data - The data to store
 */
DataChannelClient.prototype.consign = function(token, data, callback) {
  var hash = utils.rmd160sha256(data);
  var channel = this._client.send(data, {
    token: token,
    hash: hash,
    operation: 'PUSH'
  });

  channel.on('data', function(data) {
    if (data.error) {
      callback(new Error(data.message));
    } else {
      callback(null, hash);
    }

    channel.end();
  });
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
    hostname: contact.address,
    port: contact.port
  });
};

module.exports = DataChannelClient;
