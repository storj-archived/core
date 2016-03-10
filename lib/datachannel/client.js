'use strict';

var BinaryClient = require('binaryjs').BinaryClient;
var assert = require('assert');
var events = require('events');
var inherits = require('util').inherits;
var url = require('url');
var stream = require('stream');

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
  this._client = new BinaryClient(url.format({
    protocol: 'ws',
    slashes: true,
    hostname: this._contact.address,
    port: this._contact.port
  }));
}

inherits(DataChannelClient, events.EventEmitter);

/**
 * Creates a Readable Stream for the token and hash that receives the data
 * @param {String} token - The RETRIEVE token supplied by the farmer
 * @param {String} hash - The hash of the data to retrieve
 * @returns {stream.Readable}
 */
DataChannelClient.prototype.createReadStream = function(token, hash) {
  var channel = this._client.createStream({
    token: token,
    hash: hash,
    operation: 'PULL'
  });

  var readable = new stream.Readable({
    read: function() {}
  });

  channel.on('data', function(data) {
    if (Buffer.isBuffer(data)) {
      readable.push(data);
    } else if (data.error) {
      readable.emit('error', new Error(data.message));
    } else {
      readable.push(null);
    }
  });

  return readable;
};

/**
 * Creates a Writable Stream for the token and hash that stores the data
 * @param {String} token - The CONSIGN token supplied by the farmer
 * @param {String} hash - The hash of the data to store
 * @returns {stream.Writable}
 */
DataChannelClient.prototype.createWriteStream = function(token, hash) {
  var channel = this._client.createStream({
    token: token,
    hash: hash,
    operation: 'PUSH'
  });

  var writable = new stream.Writable({
    write: function(chunk, encoding, next) {
      channel.write(chunk);
      next();
    }
  });

  channel.on('data', function(data) {
    if (data.error) {
      writable.emit('error', new Error(data.message));
    } else {
      writable.end();
    }
  });

  return writable;
};

module.exports = DataChannelClient;
