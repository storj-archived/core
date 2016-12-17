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
 * @param {Number} [options.tokenTtl=1800000] - Close after idle
 */
function ShardServer(options) {
  if (!(this instanceof ShardServer)) {
    return new ShardServer(options);
  }

  this._checkOptions(options);
  events.EventEmitter.call(this);

  this.activeTransfers = 0;
  this._nodeID = options.nodeID;
  this._bridgeClient = options.bridgeClient || new BridgeClient();
  this._manager = options.storageManager;
  this._log = options.logger;
  this._ttl = options.tokenTtl || constants.TOKEN_EXPIRE;
  this._allowed = {};

  setInterval(this._reapDeadTokens.bind(this), this._ttl);
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
    assert(self._allowed[token].hash === hash, 'Token not valid for hash');
  } catch (err) {
    return [false, err];
  }

  return [true, null];
};

/**
 * Decrements the active transfer count on early socket close
 * @private
 */
ShardServer.prototype._handleEarlySocketClose = function() {
  this._log.warn('channel terminated early (possibly by client)');
  this.activeTransfers--;
};

/**
 * Decrements the active transfer count on request error
 * @private
 */
ShardServer.prototype._handleRequestError = function(err) {
  this._log.warn('channel encountered an error: %s', err.message);
  this.activeTransfers--;
};

/**
 * Receives the data stream and writes it to storage
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} req
 */
ShardServer.prototype.routeConsignment = function(req, res) {
  const self = this;
  const hasher = crypto.createHash('sha256');
  const [isAuthed, authError] = this.isAuthorized(
    req.query.token,
    req.params.hash
  );

  if (!isAuthed) {
    return res.send(401, { result: authError.message });
  }

  const {report, contact, hash} = this._allowed[req.query.token];

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

    self.activeTransfers++;
    req.on('error', self._handleRequestError.bind(self));
    res.on('close', self._handleEarlySocketClose.bind(self));
    req.on('data', function(chunk) {
      received += chunk.length;

      hasher.update(chunk);
      item.shard.write(chunk);

      if (received > shardsize) {
        report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');
        self._bridgeClient.createExchangeReport(report);
        item.shard.destroy(utils.warnOnError(self._log));
        self.activeTransfers--;
        return res.send(400, {
          result: 'Shard exceeds the amount defined in the contract'
        });
      }
    });

    req.on('end', function() {
      /* jshint maxstatements:15 */
      var calculatedHash = utils.rmd160(hasher.digest());
      self.activeTransfers--;

      if (calculatedHash !== hash) {
        report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');
        self._bridgeClient.createExchangeReport(report);
        self._log.warn('calculated hash does not match the expected result');
        item.shard.destroy(utils.warnOnError(self._log));
        return res.send(400, {
          result: 'Calculated hash does not match the expected result'
        });
      }

      self._log.debug('Shard upload completed');
      item.shard.end();
      report.end(ExchangeReport.SUCCESS, 'SHARD_UPLOADED');
      self._bridgeClient.createExchangeReport(report);
      self.reject(req.query.token);
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
  const [isAuthed, authError] = this.isAuthorized(
    req.query.token,
    req.params.hash
  );

  if (!isAuthed) {
    return res.send(401, { result: authError.message });
  }

  const {report, contact, hash} = this._allowed[req.query.token];

  this._manager.load(hash, function(err, item) {
    if (err) {
      return res.send(404, { result: err.message });
    }

    function _handleReadFailure(err) {
      self.activeTransfers--;
      report.end(ExchangeReport.FAILURE, 'READ_FAILED');
      self._bridgeClient.createExchangeReport(report);
      res.send(500, { result: err.message });
    }

    function _handleTransferFinish() {
      self.activeTransfers--;
      report.end(ExchangeReport.SUCCESS, 'SHARD_DOWNLOADED');
      self._bridgeClient.createExchangeReport(report);
      self.emit('shardDownloaded', item, contact);
      self.reject(req.query.token);
    }

    self.activeTransfers++;
    req.on('error', self._handleRequestError.bind(self));
    res.on('close', self._handleEarlySocketClose.bind(self));
    res.header('content-type', 'application/octet-stream');
    report.begin(hash);
    item.shard
      .on('error', _handleReadFailure)
      .on('end', _handleTransferFinish)
      .pipe(res);
  });
};

/**
 * Enumerates the authorized list and rejects expired
 * @private
 */
ShardServer.prototype._reapDeadTokens = function() {
  let now = Date.now();

  for (let token in this._allowed) {
    if (this._allowed[token].expires < now) {
      this.reject(token);
    }
  }
};

module.exports = ShardServer;
