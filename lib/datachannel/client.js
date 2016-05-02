'use strict';

var WebSocketClient = require('ws');
var stream = require('stream');
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
  this._client = new WebSocketClient(DataChannelClient.getChannelURL(contact));

  this._client.on('open', this._handleChannelOpen.bind(this));
  this._client.on('error', this._handleChannelError.bind(this));
}

inherits(DataChannelClient, events.EventEmitter);

/**
 * Creates a readable stream from the remote farmer for retrieval of a shard
 * @param {String} token - The RETRIEVE token supplied by the farmer
 * @param {String} hash - The hash of the data to retrieve
 * @returns {stream.Readable}
 */
DataChannelClient.prototype.createReadStream = function(token, hash) {
  var self = this;
  var auth = false;

  var rstream = new stream.Readable({
    read: function() {
      if (!auth) {
        return self._client.send(JSON.stringify({
          token: token,
          hash: hash,
          operation: 'PULL'
        }));
      }
    }
  });

  this._client.on('message', function(data) {
    if (!Buffer.isBuffer(data)) {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return rstream.emit('error', err);
      }

      if (data.code && data.code !== 200) {
        return rstream.emit('error', new Error(data.message));
      }

      return this.close();
    }

    rstream.push(data);
  });

  this._client.on('close', function() {
    rstream.push(null);
  });

  return rstream;
};

/**
 * Creates a writable stream from the remote farmer for consignment of a shard
 * @param {String} token - The CONSIGN token supplied by the farmer
 * @param {String} hash - The hash of the data to consign
 * @returns {stream.Writable}
 */
DataChannelClient.prototype.createWriteStream = function(token, hash) {
  var self = this;
  var auth = false;

  var wstream = new stream.Writable({
    write: function(chunk, encoding, next) {
      if (!auth) {
        return self._client.send(JSON.stringify({
          token: token,
          hash: hash,
          operation: 'PUSH'
        }), function() {
          auth = true;
          self._client.send(chunk, { binary: true }, next);
        });
      }

      self._client.send(chunk, { binary: true }, next);
    }
  });

  this._client.on('message', function(data) {
    if (data.code && data.code !== 200) {
      wstream.emit('error', new Error(data.message));
    }

    this.close();
  });

  return wstream;
};

/*                                                                            *\
** +------------------------------------------------------------------------+ **
** |                  THE FOLLOWING METHODS ARE DEPRECATED                  | **
** |                   THEY REMAIN ONLY FOR COMPATIBILITY                   | **
** +------------------------------------------------------------------------+ **
\*                                                                            */

/**
 * Creates a Readable Stream for the token and hash that receives the data
 * @deprecated Since v0.6.8 - use {@link DataChannelClient#createReadStream}.
 * @param {String} token - The RETRIEVE token supplied by the farmer
 * @param {String} hash - The hash of the data to retrieve
 * @returns {stream.Readable}
 */
DataChannelClient.prototype.retrieve = function(token, hash) {
  var pstream = new stream.PassThrough();

  this._client.on('message', function(data) {
    if (!Buffer.isBuffer(data)) {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return pstream.emit('error', err);
      }

      if (data.code && data.code !== 200) {
        return pstream.emit('error', new Error(data.message));
      }

      return this.close();
    }

    pstream.write(data);
  });

  this._client.on('close', function() {
    pstream.end();
  });

  this._client.send(JSON.stringify({
    token: token,
    hash: hash,
    operation: 'PULL'
  }));

  return pstream;
};

/**
 * Creates a Writable Stream for the token and hash that stores the data
 * @deprecated Since v0.6.8 - use {@link DataChannelClient#createWriteStream}.
 * @param {String} token - The CONSIGN token supplied by the farmer
 * @param {Buffer} data - The data to store
 */
DataChannelClient.prototype.consign = function(token, data, callback) {
  var self = this;
  var hash = utils.rmd160sha256(data);

  self._client.on('message', function(data) {
    if (data.code && data.code !== 200) {
      callback(new Error(data.message));
    } else {
      callback(null, hash);
    }

    this.close();
  });

  this._client.send(JSON.stringify({
    token: token,
    hash: hash,
    operation: 'PUSH'
  }), function() {
    self._client.send(data, { binary: true });
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
