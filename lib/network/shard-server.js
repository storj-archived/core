'use strict';

const assert = require('assert');
const crypto = require('crypto');
const events = require('events');
const path = require('path');
const levelup = require('levelup');
const diskusage = require('diskusage');
const ExchangeReport = require('../exchange-report');
const StorageManager = require('../storage/manager');
const Contact = require('./contact');
const inherits = require('util').inherits;
const utils = require('../utils');
const constants = require('../constants');

/**
 * Creates a shard server for sending and receiving consigned file shards
 * @constructor
 * @license AGPL-3.0
 * @param {Object} options
 * @param {String} options.nodeID - The farmer nodeID
 * @param {String} options.storagePath - Path to store tokens db
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

  // This needs to be set externally when farmer interface in constructed
  this.farmerInterface = null;

  this._manager = options.storageManager;
  this._log = options.logger;
  this._ttl = options.tokenTtl || ShardServer.TOKEN_EXPIRE;

  this._dbPath = path.join(options.storagePath, 'tokens.db');
  this._db = levelup(this._dbPath, {
    maxOpenFiles: ShardServer.MAX_OPEN_FILES
  });

  this._reapDeadTokensInterval = setInterval(
    this._reapDeadTokens.bind(this), ShardServer.REAPER_INTERVAL);
}

ShardServer.TOKEN_EXPIRE = 86400000;
ShardServer.MAX_OPEN_FILES = 10;
ShardServer.REAPER_INTERVAL = 60000;

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
 * @param {Function} callback
 */
ShardServer.prototype.accept = function(token, filehash, contact, callback) {
  assert(typeof token === 'string', 'Invalid token supplied');
  assert(typeof filehash === 'string', 'Invalid filehash supplied');
  assert(contact, 'Contact parameter is expected');

  if (!callback) {
    callback = (err) => {
      if (err) {
        this._log.error(err);
      }
    }
  }

  let expires = Date.now() + this._ttl;
  let data = JSON.stringify({
    hash: filehash,
    contact: contact,
    expires: expires
  });

  // Atomically create two records, one with the data
  // and another to search for tokens for when they expire
  var ops = [
    { type: 'put', key: 'TK' + token, value: data },
    { type: 'put', key: this._encodeExpiresKey(expires), value: token }
  ]

  this._db.batch(ops, callback);
};

ShardServer.prototype._encodeExpiresKey = function(expires) {
  let e = Buffer.alloc(8, 0);
  e.writeDoubleBE(expires);
  return 'EX' + e.toString('hex');
}

/**
 * Stop accepting data for the given token
 * @param {String} token - The authorization token created for transfer
 */
ShardServer.prototype.reject = function(token, callback) {
  assert(typeof token === 'string', 'Invalid token supplied');

  if (!callback) {
    callback = (err) => {
      if (err) {
        this._log.error(err);
      }
    }
  }

  this._db.get('TK' + token, (err, data) => {
    if (err) {
      return callback(err);
    }

    let parsed = {};

    try {
      parsed = JSON.parse(data);
    } catch (err) {
      return callback(new Error('Unable to parse token data'));
    }

    let ops = [
      { type: 'del', key: 'TK' + token },
      { type: 'del', key: this._encodeExpiresKey(parsed.expires) }
    ];

    this._db.batch(ops, callback);
  });
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
ShardServer.prototype.isAuthorized = function(token, hash, callback) {
  if (!token) {
    return callback(new Error('You did not supply a token'));
  }

  if (!hash) {
    return callback(new Error('You did not supply the data hash'));
  }

  this._db.get('TK' + token, (err, data) => {
    if (err && err.notFound) {
      return callback(new Error('The supplied token is not accepted'));
    } else if (err) {
      return callback(err);
    }

    let parsed = {};

    try {
      parsed = JSON.parse(data);
    } catch (e) {
      return callback(new Error('Unable to parse token data'));
    }

    if (parsed.hash !== hash) {
      return callback(new Error('Token not valid for hash'));
    }

    if (parsed.expires < Date.now()) {
      return callback(new Error('Token has expired'));
    }

    let contact = new Contact(parsed.contact);

    callback(null, contact);
  });
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

ShardServer.prototype._sendExchangeReport = function(bridgeUrl, report) {
  let headers = {};
  let body = report.toObject();
  this.farmerInterface.bridgeRequest(
    bridgeUrl,'POST', '/reports/exchanges',
    headers, body, (err) => {
      if (err) {
        this._log.warn('Unable to send exchange report to bridge: %s, '+
                       'reason: %s', bridgeUrl, err.message);
      } else {
        this._log.debug('exchange report submitted: %s', JSON.stringify(body));
      }
    });
}

/**
 * Receives the data stream and writes it to storage
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
ShardServer.prototype.routeConsignment = function(req, res) {
  const self = this;
  const hasher = crypto.createHash('sha256');
  const token = req.query.token;
  const hash = req.params.hash;

  this.isAuthorized(token, hash, (err, contact) => {
    if (err) {
      return res.send(401, { result: err.message });
    }

    let report = new ExchangeReport({
      reporterId: this._nodeID,
      farmerId: this._nodeID
    })

    report.begin(hash);

    // eslint-disable-next-line max-statements
    this._manager.load(hash, function(err, item) {
      if (err) {
        return res.send(404, { result: err.message });
      }

      const contract = item.getContract(contact);
      if (!contract) {
        return res.send(500, { result: 'Unable to locate contract'});
      }
      const bridgeExtendedKey = contract.get('renter_hd_key');
      const bridge = self.farmerInterface.bridges.get(bridgeExtendedKey);
      if (!bridge) {
        return res.send(500, { result: 'Not connected to bridge'});
      }

      const shardsize = contract.get('data_size');
      if (!Number.isInteger(shardsize)) {
        return res.send(500, { result: 'Data size is not an integer' });
      }
      const storagePath = self.farmerInterface._options.storagePath;

      // Check that we will not exceed available storage space
      // TODO we can remove this when there is better accounting of shard data
      // eslint-disable-next-line max-statements
      diskusage.check(storagePath, (err, info) => {
        if (err) {
          return res.send(503, { result: 'Unable to determine free space'} );
        }

        if (info.available - shardsize <= constants.FREE_SPACE_PADDING) {
          self._log.warn('disk space is at maximum capacity');
          return res.send(503, { result: 'No space left'});
        }

        // If the shard is not writable, it means we already have it, so let's
        // just respond with a success message
        if (typeof item.shard.write !== 'function') {
          report.end(ExchangeReport.SUCCESS, 'SHARD_EXISTS');

          self._sendExchangeReport(bridge.url, report);
          return res.send(304, { result: 'Consignment completed' });
        }

        let received = 0;

        self.activeTransfers++;
        req.on('error', self._handleRequestError.bind(self));
        res.on('close', self._handleEarlySocketClose.bind(self));
        req.on('data', function(chunk) {
          received += chunk.length;

          if (received > shardsize) {
            report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');

            self._sendExchangeReport(bridge.url, report);

            item.shard.destroy(utils.warnOnError(self._log));
            self.activeTransfers--;
            return res.send(400, {
              result: 'Shard exceeds the amount defined in the contract'
            });
          }

          hasher.update(chunk);
          item.shard.write(chunk);
        });

        req.on('end', function() {
          /* eslint max-statements: [2, 15] */
          var calculatedHash = utils.rmd160(hasher.digest());
          self.activeTransfers--;

          if (calculatedHash !== hash) {
            report.end(ExchangeReport.FAILURE, 'FAILED_INTEGRITY');

            self._sendExchangeReport(bridge.url, report);

            self._log.warn('calculated hash does not match ' +
                           'the expected result');
            item.shard.destroy(utils.warnOnError(self._log));
            return res.send(400, {
              result: 'Calculated hash does not match the expected result'
            });
          }

          self._log.info('Shard upload completed hash %s size %s',
                         hash,
                         shardsize);
          item.shard.end();
          report.end(ExchangeReport.SUCCESS, 'SHARD_UPLOADED');

          self._sendExchangeReport(bridge.url, report);

          self.reject(req.query.token);

          res.send(200, { result: 'Consignment completed' });
          self.emit('shardUploaded', item, contact);
        });

      });

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
  const token = req.query.token;
  const hash = req.params.hash;

  this.isAuthorized(token, hash, (err, contact) => {
    if (err) {
      return res.send(401, { result: err.message });
    }

    let report = new ExchangeReport({
      reporterId: this._nodeID,
      farmerId: this._nodeID
    })

    // eslint-disable-next-line max-statements
    this._manager.load(hash, function(err, item) {
      if (err) {
        return res.send(404, { result: err.message });
      }

      const contract = item.getContract(contact);
      if (!contract) {
        return res.send(500, { result: 'Unable to locate contract'});
      }
      const bridgeExtendedKey = contract.get('renter_hd_key');
      const bridge = self.farmerInterface.bridges.get(bridgeExtendedKey);
      if (!bridge) {
        return res.send(500, { result: 'Not connected to bridge'});
      }

      function _handleReadFailure(err) {
        self.activeTransfers--;
        report.end(ExchangeReport.FAILURE, 'READ_FAILED');

        self._sendExchangeReport(bridge.url, report);

        res.send(500, { result: err.message });
      }

      function _handleTransferFinish() {
        self.activeTransfers--;

        if (req.headers['user-agent']) {
          self._log.info('Shard download completed hash %s size %s',
            item.hash,
            contract.get('data_size'));
        } else {
          self._log.info('Mirror download completed hash %s size %s',
            item.hash,
            contract.get('data_size'));
        }

        report.end(ExchangeReport.SUCCESS, 'SHARD_DOWNLOADED');

        self._sendExchangeReport(bridge.url, report);

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
  });
};

/**
 * Close token database
 * @param {Function} callback
 */
ShardServer.prototype.close = function(callback) {
  this._db.close(callback);
}

/**
 * Enumerates the authorized list and rejects expired
 * @private
 */
ShardServer.prototype._reapDeadTokens = function() {
  let ops = [];

  let stream = this._db.createReadStream({
    lte: this._encodeExpiresKey(Date.now()),
    gte: this._encodeExpiresKey(0)
  });

  stream.on('data', (data) => {
    ops.push({ type: 'del', key: 'TK' + data.value });
    ops.push({ type: 'del', key: data.key });
  })

  stream.on('error', (err) => {
    this._log.error(err);
  });

  stream.on('end', () => {
    this._db.batch(ops, (err) => {
      if (err) {
        this._log.error(err);
      }
      this.emit('reapedTokens', ops.length / 2);
    });
  });
};

module.exports = ShardServer;
