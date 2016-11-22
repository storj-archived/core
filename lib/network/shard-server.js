'use strict';

var assert = require('assert');
var StorageManager = require('../storage/manager');
var events = require('events');
var inherits = require('util').inherits;
var crypto = require('crypto');
var utils = require('../utils');
var constants = require('../constants');
var BridgeClient = require('../bridge-client');
var ExchangeReport = require('../bridge-client/exchange-report');

/**
 * Creates a shard server for sending and receiving consigned file shards
 * @constructor
 * @license AGPL-3.0
 * @param {Object} options
 * @param {String} options.nodeID - The farmer nodeID
 * @param {StorageManager} options.storageManager - Storage manager backend
 * @param {kad.Logger} options.logger - Logger to use from {@link Network}
 * @param {Number} [options.tokenTtl=86400000] - Close after idle
 */
function ShardServer(options) {
  if (!(this instanceof ShardServer)) {
    return new ShardServer(options);
  }

  this._checkOptions(options);
  events.EventEmitter.call(this);

  this._nodeID = options.nodeID;
  this._bridgeClient = options.bridgeClient || new BridgeClient();
  this._manager = options.storageManager;
  this._log = options.logger;
  this._ttl = options.tokenTtl || constants.TOKEN_EXPIRE;
  this._allowed = {};
}

/**
 * Triggered when a shard has finished uploading to this instance
 * @event ShardServer#shardUploaded
 * @param {StorageItem} item - The item associated with the upload
 */

/**
 * Triggered when a shard has finished downloading from this instance
 * @event ShardServer#shardDownloaded
 * @param {StorageItem} item - The item associated with the download
 */

/**
 * Triggered when a error occurs
 * @event ShardServer#error
 * @param {Error} error - The error object
 */

inherits(ShardServer, events.EventEmitter);

/**
 * Begin accepting data for the given file hash and token
 * @param {String} token - The authorization token created for transfer
 * @param {String} filehash - The shard hash to allow for the token
 * @param {Contact} contact - contact that negotiated the token
 */
ShardServer.prototype.accept = function(token, filehash, contact) {
  assert(typeof token === 'string', 'Invalid token supplied');
  assert(typeof filehash === 'string', 'Invalid filehash supplied');

  this._allowed[token] = {
    hash: filehash,
    client: null,
    contact: contact,
    expires: Date.now() + this._ttl,
    report: new ExchangeReport({
      reporterId: this._nodeID,
      farmerId: this._nodeID
    })
  };
};

/**
 * Stop accepting data for the given token
 * @param {String} token - The authorization token created for transfer
 */
ShardServer.prototype.reject = function(token) {
  assert(typeof token === 'string', 'Invalid token supplied');

  if (this._allowed[token] && this._allowed[token].client) {
    this._allowed[token].client.res.send(401, {
      error: 'The token was rejected'
    });
  }

  delete this._allowed[token];
};

/**
 * Checks the options supplied to constructor
 * @private
 */
ShardServer.prototype._checkOptions = function(options) {
  assert.ok(options, 'No options were supplied to constructor');
  assert(
    options.storageManager instanceof StorageManager,
    'Invalid manager supplied'
  );
  assert.ok(options.logger, 'Invalid logger supplied');
  assert.ok(options.nodeID, 'Invalid nodeID supplied');
};

/**
 * Validates the given token
 * @param {String} token
 * @param {String} hash
 */
ShardServer.prototype.isAuthorized = function(token, hash) {
  var self = this;

  try {
    assert.ok(token, 'You did not supply a token');
    assert.ok(self._allowed[token], 'The supplied token is not accepted');
    assert.ok(hash, 'You did not supply the data hash');
    assert(self._allowed[token].expires > Date.now(), 'Token has expired');
    assert(self._allowed[token].client === null, 'Channel is already active');
    assert(self._allowed[token].hash === hash, 'Token not valid for hash');
  } catch (err) {
    return [false, err];
  }

  return [true, null];
};

/**
 * Receives the data stream and writes it to storage
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} req
 */
ShardServer.prototype.routeConsignment = function(req, res) {
  const self = this;
  const hasher = crypto.createHash('sha256');
  const [isAuthed, authError] = this.isAuthorized(req.token, req.params.hash);

  if (!isAuthed) {
    return res.send(401, { result: authError.message });
  }

  const {report, contact, hash} = this._allowed[token];

  report.begin(hash);

  this._manager.load(hash, function(err, item) {
    if (err) {
      return res.send(404, { result: err.message });
    }

    const nodeID = Object.keys(item.contracts)[0];
    const shardsize = item.getContract({ nodeID: nodeID }).get('data_size');

    // If the shard is not writable, it means we already have it, so let's
    // just respond with a success message
    if (typeof item.shard.write !== 'function') {
      report.end(ExchangeReport.SUCCESS, 'SHARD_EXISTS');
      self._bridgeClient.createExchangeReport(report);
      return res.send(304, { result: 'Consignment completed' });
    }

    let received = 0;

    req.on('data', function(chunk) {
      received += chunk.length;

      hasher.update(chunk);
      item.shard.write(chunk);

      if (received > shardsize) {
        report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');
        self._bridgeClient.createExchangeReport(report);
        item.shard.destroy(utils.noop);
        return res.send(400, {
          result: 'Shard exceeds the amount defined in the contract'
        });
      }
    });

    req.on('end', function() {
      var calculatedHash = utils.rmd160(hasher.digest());

      if (calculatedHash !== hash) {
        report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');
        self._bridgeClient.createExchangeReport(report);
        self._log.warn('calculated hash does not match the expected result');
        item.shard.destroy(utils.noop);
        return res.send(400, {
          result: 'Calculated hash does not match the expected result'
        });
      }

      self._log.debug('Shard upload completed');
      item.shard.end();
      report.end(ExchangeReport.SUCCESS, 'SHARD_UPLOADED');
      self._bridgeClient.createExchangeReport(report);
      res.send(200, { result: 'Consignment completed' });
      self.emit('shardUploaded', item, contact);
    });
  });
};

/**
 * Pumps the data through to the client
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
ShardServer.prototype.routeRetrieval = function(req, res) {
  const self = this;
  const hasher = crypto.createHash('sha256');
  const [isAuthed, authError] = this.isAuthorized(req.token, req.params.hash);

  if (!isAuthed) {
    return res.send(401, { result: authError.message });
  }

  const {report, contact, hash} = this._allowed[token];

  function _handleReadFailure(err) {
    report.end(ExchangeReport.FAILURE, 'READ_FAILED');
    self._bridgeClient.createExchangeReport(report);
  }

  function _handleTransferFinish() {
    report.end(ExchangeReport.SUCCESS, 'SHARD_DOWNLOADED');
    self._bridgeClient.createExchangeReport(report);
    self.emit('shardDownloaded', item, contact);
  }

  this._manager.load(hash, function(err, item) {
    if (err) {
      return res.send(404, { result: err.message });
    }

    report.begin(hash);
    item.shard
      .on('error', _handleReadFailure)
      .pipe(res)
      .on('finish', _handleTransferFinish)
  });
};

module.exports = ShardServer;
