'use strict';

var assert = require('assert');
var fs = require('fs');
var querystring = require('querystring');
var request = require('request');
var utils = require('../utils');
var FileDemuxer = require('../file-handling/file-demuxer');
var FileMuxer = require('../file-handling/file-muxer');
var AuditStream = require('../audit-tools/audit-stream');
var Contact = require('../network/contact');
var crypto = require('crypto');
var path = require('path');
var mime = require('mime');
var uuid = require('node-uuid');
var merge = require('merge');
var Logger = require('kad-logger-json');
var EventEmitter = require('events').EventEmitter;
var UploadState = require('./upload-state');
var Blacklist = require('./blacklist');
var stream = require('readable-stream');
var async = require('async');
var ExchangeReport = require('./exchange-report');

/**
 * Represents a client interface to a given bridge server
 * @constructor
 * @license LGPL-3.0
 * @see https://github.com/storj/bridge
 * @see https://storj.io/api.html
 * @param {String} [uri=https://api.storj.io] - API base URI
 * @param {Object} options
 * @param {KeyPair} options.keyPair - KeyPair instance for request signing
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.requestTimeout - Timeout when making requests to the
 * bridge
 * @param {Number} options.transferConcurrency - Upload concurrency limit
 * @param {Number} options.transferRetries - Limit number of shard transfer
 * retries before getting a new contract
 * @param {Object} options.basicAuth
 * @param {String} options.basicAuth.email - Email address for HTTP basic auth
 * @param {String} options.basicAuth.password - Password for HTTP basic auth
 */
function BridgeClient(uri, options) {
  if (!(this instanceof BridgeClient)) {
    return new BridgeClient(uri, options);
  }

  this._options = this._checkOptions(uri, options);
  this._blacklist = new Blacklist(this._options.blacklistFolder);
  this._logger = this._options.logger;
  this._transferConcurrency = this._options.transferConcurrency;
}

BridgeClient.DEFAULTS = {
  baseURI: 'https://api.storj.io',
  logger: new Logger(0),
  transferConcurrency: 3,
  transferRetries: 0,
  blacklistFolder: utils.tmpdir(),
  requestTimeout: 30000,
  retryThrottle: 500
};

/**
 * Check the options supplied to the constructor
 * @private
 */
BridgeClient.prototype._checkOptions = function(uri, options) {
  options = options || {
    baseURI: uri || process.env.STORJ_BRIDGE || BridgeClient.DEFAULTS.baseURI
  };
  options.baseURI = options.baseURI || uri;
  options = merge(Object.create(BridgeClient.DEFAULTS), options);
  assert.ok(utils.validateLogger(options.logger), 'Invalid logger supplied');
  return options;
};

/**
 * Get the remote Storj Bridge API documentation and version as JSON
 * @param {Function} callback
 */
BridgeClient.prototype.getInfo = function(callback) {
  return this._request('GET', '/', {}, callback);
};

/**
 * Fetches the list of known contacts filtered according to the options
 * @param {Object} options
 * @param {Number} options.page - The page number of the contact list to fetch
 * @param {Boolean} options.connected - Filter results by connection status
 * @param {Function} callback
 */
BridgeClient.prototype.getContactList = function(options, callback) {
  return this._request('GET', '/contacts', options, callback);
};

/**
 * Get the contact information for the given nodeID
 * @param {String} nodeId - The nodeID of the contact
 * @param {Function} callback
 */
BridgeClient.prototype.getContactByNodeId = function(nodeId, callback) {
  return this._request('GET', '/contacts/' + nodeId, {}, callback);
};

/**
 * Registers a user account
 * @param {Object} options
 * @param {String} options.email - Email address for verification email
 * @param {String} options.password - Password to register (auto hashed)
 * @param {String} options.redirect - URL to redirect to after verification
 * @param {String} options.pubkey - Optional ECDSA public key to register
 * @param {Function} callback
 */
BridgeClient.prototype.createUser = function(options, callback) {
  return this._request('POST', '/users', {
    email: options.email,
    password: utils.sha256(options.password, 'utf8'),
    redirect: options.redirect,
    pubkey: options.pubkey
  }, callback);
};

/**
 * Deactivates a user account
 * @param {Object} options
 * @param {String} options.email - Email address of user to deactivate
 * @param {String} options.redirect - URL to redirect after verification
 * @param {Function} callback
 */
BridgeClient.prototype.destroyUser = function(options, callback) {
  return this._request('DELETE', '/users/' + options.email, {
    redirect: options.redirect
  }, callback);
};

/**
 * Requests a password reset
 * @param {Object} options
 * @param {String} options.email - Email address of user to reset password
 * @param {String} options.password - The cleartext password to reset to
 * @param {String} options.redirect - URL to redirect adter confirmation
 * @param {Function} callback
 */
BridgeClient.prototype.resetPassword = function(options, callback) {
  return this._request('PATCH', '/users/' + options.email, {
    password: utils.sha256(options.password, 'utf8'),
    redirect: options.redirect
  }, callback);
};

/**
 * Returns list of associated public keys
 * @param {Function} callback
 */
BridgeClient.prototype.getPublicKeys = function(callback) {
  return this._request('GET', '/keys', {}, callback);
};

/**
 * Registers a public key for the caller
 * @param {String} pubkey - Hex encoded ECDSA (secp256k1) public key
 * @param {Function} callback
 */
BridgeClient.prototype.addPublicKey = function(pubkey, callback) {
  return this._request('POST', '/keys', { key: pubkey }, callback);
};

/**
 * Disassociates the public key from the caller
 * @param {String} pubkey - Hex encoded ECDSA (secp256k1) public key
 * @param {Function} callback
 */
BridgeClient.prototype.destroyPublicKey = function(pubkey, callback) {
  return this._request('DELETE', '/keys/' + pubkey, {}, callback);
};

/**
 * Lists the caller's file buckets
 * @param {Function} callback
 */
BridgeClient.prototype.getBuckets = function(callback) {
  return this._request('GET', '/buckets', {}, callback);
};

/**
 * Returns the bucket information by ID
 * @param {String} id - Unique bucket ID
 * @param {Function} callback
 */
BridgeClient.prototype.getBucketById = function(id, callback) {
  return this._request('GET', '/buckets/' + id, {}, callback);
};

/**
 * Creates a new file bucket
 * @param {Object} data - Bucket parameters for creation
 * @param {Function} callback
 */
BridgeClient.prototype.createBucket = function(data, callback) {
  return this._request('POST', '/buckets', data, callback);
};

/**
 * Removes the bucket
 * @param {String} id - Unique bucket ID
 * @param {Function} callback
 */
BridgeClient.prototype.destroyBucketById = function(id, callback) {
  return this._request('DELETE', '/buckets/' + id, {}, callback);
};

/**
 * Updates the bucket
 * @param {String} id - Unique bucket ID
 * @param {Object} updates - Bucket update parameters
 * @param {Function} callback
 */
BridgeClient.prototype.updateBucketById = function(id, updates, callback) {
  return this._request('PATCH', '/buckets/' + id, updates, callback);
};

/**
 * Lists the files stored in a bucket
 * @param {String} id - Unique bucket ID
 * @param {Function} callback
 */
BridgeClient.prototype.listFilesInBucket = function(id, callback) {
  return this._request('GET', '/buckets/' + id + '/files', {}, callback);
};

/**
 * Create bucket token
 * @param {String} id - Unique bucket ID
 * @param {String} operation - PUSH or PULL (file operation)
 * @param {Function} callback
 */
BridgeClient.prototype.createToken = function(id, operation, callback) {
  return this._request('POST', '/buckets/' + id + '/tokens', {
    operation: operation
  }, callback);
};

/**
 * Removes a file from a bucket
 * @param {String} id - Unique bucket ID
 * @param {String} file - ID of the file to remove from bucket
 * @param {Function} callback
 */
BridgeClient.prototype.removeFileFromBucket = function(id, file, callback) {
  return this._request(
    'DELETE',
    '/buckets/' + id + '/files/' + file,
    {},
    callback
  );
};

/**
 * Creates a file staging frame
 * @param {Function} callback
 */
BridgeClient.prototype.createFileStagingFrame = function(callback) {
  return this._request('POST', '/frames', {}, callback);
};

/**
 * List all of the file staging frames
 * @param {Function} callback
 */
BridgeClient.prototype.getFileStagingFrames = function(callback) {
  return this._request('GET', '/frames', {}, callback);
};

/**
 * Get info about a file (bucket, mimetype, filename, frame, size, id)
 * @param {String} bucket - bucket id
 * @param {String} file - file id
 * @param {Function} callback
 */
BridgeClient.prototype.getFileInfo = function(bucket, file, callback) {
  var path = '/buckets/' + bucket + '/files/' + file + '/info';
  return this._request('GET', path, {}, callback);
};

/**
 * Gets the frame by it's ID
 * @param {String} bucket - Unique bucket ID
  * @param {String} file - Unique file ID
 * @param {Function} callback
 */
BridgeClient.prototype.getFrameFromFile = function(bucket, file, callback) {
  var self = this;

  self.getFileInfo(bucket, file, function(err, file) {
    if (err) {
      return callback(err);
    }

    function _extractFrame(err, frame) {
      if (err) {
        return callback(err);
      }

      callback(null, frame);
    }

    return self.getFileStagingFrameById(file.frame, _extractFrame);
  });
};

/**
 * Fetch an existing file staging frame by it's ID
 * @param {String} id - Unique frame ID
 * @param {Function} callback
 */
BridgeClient.prototype.getFileStagingFrameById = function(id, callback) {
  return this._request('GET', '/frames/' + id, {}, callback);
};

/**
 * Destroy an existing file staging frame
 * @param {String} id - Unique frame ID
 * @param {Function} callback
 */
BridgeClient.prototype.destroyFileStagingFrameById = function(id, callback) {
  return this._request('DELETE', '/frames/' + id, {}, callback);
};

/**
 * Adds the given shard metadata to the file staging frame
 * @param {String} id - Unique frame ID
 * @param {Object} shard - The shard metadata
 * @param {Object} options
 * @param {Number} options.retry - Retry the request this many times if failed
 * @param {Function} callback
 */
BridgeClient.prototype.addShardToFileStagingFrame = function(f, s, opt, cb) {
  var self = this;
  var retries = 0;
  var pendingReq = null;

  if (typeof arguments[2] === 'function') {
    cb = opt;
    opt = { retry: 24 };
  }

  function _addShard() {
    self._logger.info(
      'Querying bridge for contract for %s (retry: %s)',
      s.hash,
      retries
    );

    pendingReq = self._request('PUT', '/frames/' + f, s, function(err, result) {
      if (err) {
        if (opt.retry > retries) {
          retries++;
          return _addShard();
        }

        return cb(err);
      }

      cb(null, result);
    });
  }

  _addShard();

  return {
    cancel: function() {
      opt.retry = 0;
      pendingReq.abort();
    }
  };
};

/**
 * Instructs the bridge to find N mirroring farmers for redundancy
 * @param {String} id - Unique bucket ID
 * @param {String} token - Token from {@link BridgeClient#createToken}
 * @param {String} file - Path to file to store
 * @param {Number} concurrency - Upload concurrency
 * @param {Function} callback
 */
BridgeClient.prototype.replicateFileFromBucket = function(id, file, n, cb) {
  if (typeof n === 'function') {
    cb = n;
    n = undefined;
  }

  return this._request('POST', '/buckets/' + id + '/mirrors', {
    file: file,
    redundancy: n
  }, cb);
};

/**
 * Returns the established and available mirrors for a given file
 * @param {String} id - Unique bucket ID
 * @param {String} file - Unique file ID
 * @param {Function} callback
 */
BridgeClient.prototype.listMirrorsForFile = function(id, file, cb) {
  return this._request(
    'GET',
    '/buckets/' + id + '/files/' + file + '/mirrors',
    {},
    cb
  );
};

/**
 * Stores a file in the bucket
 * @param {String} id - Unique bucket ID
 * @param {String} token - Token from {@link BridgeClient#createToken}
 * @param {String} file - Path to file to store
 * @param {Function} callback
 */
BridgeClient.prototype.storeFileInBucket = function(id, token, file, cb) {
  var self = this;
  var fileSize = fs.statSync(file).size;

  if (fileSize <= 0) {
    return cb(new Error(fileSize +' bytes is not a supported file size.'));
  }

  var shardSize = FileDemuxer.getOptimalShardSize(
    {
      fileSize: fileSize,
      shardConcurrency: this._transferConcurrency
    }
  );
  var uploadState = new UploadState({
    id: id,
    file: file,
    onComplete: cb,
    worker: this._shardUploadWorker.bind(this),
    numShards: Math.ceil(fileSize / shardSize),
    concurrency: this._transferConcurrency
  });

  function _createFileStagingFrame() {
    self._logger.info('Creating file staging frame');
    self.createFileStagingFrame(function(err, frame) {
      if (err) {
        self._logger.error(err.message);
        return cb(err);
      }

      var demuxer = new FileDemuxer(file, { shardSize: shardSize });

      demuxer.on('shard', function(shardStream, index) {
        self._handleShardStream(shardStream, index, frame, uploadState);
      }).on('error', cb);
    });
  }

  return _createFileStagingFrame();
};

BridgeClient.prototype._shardUploadWorker = function(task, done) {
  var self = this;

  self._logger.info(
    'Trying to upload shard %s index %s',
    task.meta.tmpName,
    task.meta.index
  );
  task.state.cleanQueue.push(task.meta.tmpName);

  task.shard.on('data', function(data) {
    task.meta.size += data.length;
    task.meta.hasher.update(data);
    task.tmpFile.write(data);
  }).resume();

  task.shard.on('end', task.tmpFile.end.bind(task.tmpFile));

  task.tmpFile.on('finish', function() {
    task.meta.hash = task.meta.hasher.digest();
    self._handleShardTmpFileFinish(task.state, task.meta, done);
  });
};

/**
 * Handles a demuxed shard and writes it to tmp and updates the state
 * @private
 * @param {stream.Readable} shard - Shard stream
 * @param {Number} i  - Index of the demuxed shard
 * @param {Object} frame - Frame object returned from bridge
 * @param {UploadState} state - The upload state machine
 */
BridgeClient.prototype._handleShardStream = function(shard, i, frame, state) {
  var tmpdir = utils.tmpdir();
  var meta = {
    frame: frame,
    tmpName: path.join(tmpdir, crypto.randomBytes(6).toString('hex')),
    size: 0,
    index: i,
    hasher: crypto.createHash('sha256'),
    hash: null,
    excludeFarmers: this._blacklist.toObject(),
    transferRetries: 0
  };
  var tmpFile = fs.createWriteStream(meta.tmpName);
  var passthrough = new stream.PassThrough();

  passthrough.pause();
  state.queue.push({
    state: state,
    tmpFile: tmpFile,
    meta: meta,
    shard: shard.pipe(passthrough)
  });
};

/**
 * Generate audits for shard and add to frame
 * @private
 * @param {UploadState} state - The shard upload state machine
 * @param {Object} meta - Shard metadata reference
 * @param {Function} done - To be called on task complete
 */
BridgeClient.prototype._handleShardTmpFileFinish = function(state, meta, done) {
  var self = this;
  var hash = utils.rmd160(meta.hash);
  var auditGenerator = new AuditStream(3);
  var shardFile = fs.createReadStream(meta.tmpName);

  self._logger.info('Hash for this shard is: %s', hash);

  function _handleError(err) {
    self._logger.warn('Failed to upload shard...');
    state.cleanup();
    return state.callback(err);
  }

  function _teardownAuditListeners() {
    auditGenerator.removeAllListeners();
  }

  shardFile.on('error', _handleError);
  state.on('killed', _teardownAuditListeners);

  function _getContract() {
    if (state.killed) {
      return done();
    }

    if (!meta.challenges && !meta.tree) {
      meta.challenges = auditGenerator.getPrivateRecord().challenges;
      meta.tree = auditGenerator.getPublicRecord();

      self._logger.info('Audit generation for shard done.');
    }

    self._logger.info('Waiting on a storage offer from the network...');

    var addShardToFrame = self.addShardToFileStagingFrame(meta.frame.id, {
      hash: hash,
      size: meta.size,
      index: meta.index,
      challenges: meta.challenges,
      tree: meta.tree,
      exclude: self._blacklist.toObject()
    }, function(err, pointer) {
      if (state.killed) {
        return done();
      }

      if (err) {
        return _handleError(err);
      }

      self._startTransfer(pointer, state, meta, done);
    });

    state.removeListener('killed', _teardownAuditListeners);
    state.on('killed', addShardToFrame.cancel);
  }

  if (meta.challenges && meta.tree) {
    _getContract();
  } else {
    shardFile.pipe(auditGenerator).on('finish', _getContract);
  }
};

/**
 * Starts a retryable shard transfer operation
 * @private
 * @param {Object} pointer - Pointer object returned from bridge
 * @param {UploadState} state - Upload state machine
 * @param {Object} meta - Shard metadata reference
 * @param {Function} done - Task complete callback
 */
BridgeClient.prototype._startTransfer = function(pointer, state, meta, done) {
  var self = this;
  var transferStatus = self._transferShard(
    new EventEmitter(),
    meta.tmpName,
    pointer,
    state
  );

  if (!meta.exchangeReport) {
    meta.exchangeReport = new ExchangeReport({
      reporterId: this._getReporterId(),
      clientId: this._getReporterId(),
      farmerId: pointer.farmer.nodeID
    });

    meta.exchangeReport.begin(pointer.hash);
  }

  state.on('killed', function() {
    transferStatus.removeAllListeners();
  });
  self._logger.info('Contract negotiated with: %j', pointer.farmer);

  transferStatus.on('retry', function() {
    if (meta.transferRetries < self._options.transferRetries) {
      meta.transferRetries++;
      self._logger.info('Retrying shard transfer, pointer: %j', pointer);
      setTimeout(function() {
        self._transferShard(transferStatus, meta.tmpName, pointer, state);
      }, self._options.retryThrottle);
    } else {
      self._logger.info(
        'Shard transfer failed %s times, getting another contract...',
        meta.transferRetries
      );
      transferStatus.removeAllListeners();
      self._blacklist.push(pointer.farmer.nodeID);
      meta.exchangeReport.end(ExchangeReport.FAILURE, 'TRANSFER_FAILED');
      self.createExchangeReport(meta.exchangeReport);
      meta.exchangeReport = null;
      meta.transferRetries = 0;
      self._handleShardTmpFileFinish(state, meta, done);
    }
  });

  transferStatus.removeAllListeners('finish');
  transferStatus.once('finish', function() {
    self._shardTransferComplete(state, meta.frame, done);
    meta.exchangeReport.end(ExchangeReport.SUCCESS, 'SHARD_UPLOADED');
    self._logger.info('sending exchange report');
    self.createExchangeReport(meta.exchangeReport);
  });
};

/**
 * Finalizes shard transfer and if all complete adds entry to bucket
 * @private
 * @param {UploadState} state - Shard upload state machine
 * @param {Object} frame - Frame object returned from bridge
 * @param {Function} done - Task completion callback
 */
BridgeClient.prototype._shardTransferComplete = function(state, frame, done) {
  var self = this;
  var retry = 0;

  state.completed++;
  this._logger.info(
    'Shard transfer completed! %s remaining...',
    state.numShards - state.completed
  );

  if (state.completed !== state.numShards) {
    return done();
  }

  // NB: use the original filename if called from cli
  var origFileName = path.basename(state.file).split('.crypt')[0];

  state.cleanup();

  function _shardTransferComplete() {
    self._logger.info('Transfer finished, creating entry.. (retry: %s)', retry);

    self._request('POST', '/buckets/' + state.bucketId + '/files', {
      frame: frame.id,
      mimetype: mime.lookup(origFileName),
      filename: origFileName
    }, function(err, file) {
      if (err) {

        if (retry < 6) {
          retry++;
          return _shardTransferComplete();
        }

        self._logger.error(err.message);
      }

      state.callback(err, file);
      return done();
    });
  }

  return _shardTransferComplete();
};

/**
 * Transfers a shard to a specified farmer
 * @private
 * @param {events.EventEmitter} emitter - For getting status events
 * @param {String} tmpName - Path to shard file
 * @param {Object} pointer - Farmer Contact information
 * @param {UploadState} state - The upload state machine
 */
BridgeClient.prototype._transferShard = function(evt, name, pointer, state) {
  var self = this;
  var shardFile = fs.createReadStream(name);
  var uploader = utils.createShardUploader(
    new Contact(pointer.farmer),
    pointer.hash,
    pointer.token
  );

  function _handleUploadError(err) {
    self._logger.warn('Failed to transfer shard, reason: %s', err.message);
    uploader.removeAllListeners();
    evt.emit('retry', name, pointer);
  }

  function _handleStateKilled() {
    shardFile.unpipe(uploader);
    uploader.end();
    evt.emit('finish');
    evt.removeAllListeners('finish');
  }

  function _handleResponse(res) {
    /* istanbul ignore if */
    if (res.statusCode === 200) {
      return;
    }

    let body = '';

    res.on('data', (data) => body += data.toString());
    res.on('end', () => {
      let errMessage = '';

      try {
        errMessage = JSON.parse(body).result;
      } catch (err) {
        errMessage = '¯\_(ツ)_/¯';
      }

      uploader.emit('error', new Error(errMessage));
    });
  }

  state.on('killed', _handleStateKilled);
  state.uploaders.push(uploader);
  uploader.on('response', _handleResponse);
  uploader.on('error', (err) => _handleUploadError(err));
  shardFile.pipe(uploader).on('finish', function() {
    state.removeListener('killed', _handleStateKilled);
    evt.emit('finish');
    evt.removeAllListeners('finish');
  });

  return evt;
};

/**
 * Retrieves a series of file pointers from the bucket
 * @param {Object} options
 * @param {String} options.bucket - Unique bucket ID
 * @param {String} options.token - Token from {@link BridgeClient#createToken}
 * @param {String} options.file - The unique file pointer ID
 * @param {Number} options.skip - The starting index of pointers to resolve
 * @param {Number} options.limit - The number of pointers to resolve
 * @param {Function} callback
 */
BridgeClient.prototype.getFilePointers = function(options, cb) {
  var self = this;

  function _request(done) {
    request({
      method: 'GET',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + options.bucket + '/files/' + options.file,
      timeout: self._options.requestTimeout,
      headers: {
        'x-token': options.token
      },
      qs: {
        skip: options.skip,
        limit: options.limit,
        exclude: Array.isArray(options.exclude) ? options.exclude.join() : null
      },
      json: true
    }, function(err, res, body) {
      self._logger.debug('Response Body: %s', JSON.stringify(body));

      if (err) {
        return done(err);
      }

      if (res.statusCode !== 200 && res.statusCode !== 304) {
        return done(new Error(body.error || body));
      }

      done(null, body);
    });
  }

  async.retry({
    times: 3,
    interval: self._options.retryThrottle,
    errorFilter: (e) => {
      const shouldRetry = ['ETIMEDOUT'].includes(e.message);
      self._logger.warn('Request failed, reason: %s - retrying (%s)...',
                        e.message, shouldRetry);
      return shouldRetry;
    }
  }, _request, cb);
};

/**
 * Create a readable stream from the supplied file pointer
 * @private
 * @param {Object} pointer
 */
BridgeClient.prototype._createInputFromPointer = function(pointer) {
  return utils.createShardDownloader(
    new Contact(pointer.farmer),
    pointer.hash,
    pointer.token
  );
};

/**
 * Open a series of shard transfers based on the returned value of
 * {@link BridgeClient#getFilePointers} to resolve all the shards and
 * reassemble them together as a binary stream
 * @param {Array} pointers - Result of {@link BridgeClient#getFilePointers}
 * @param {Object} [muxerOptions] - Optional overrides for the file muxer
 * @param {Function} callback
 */
BridgeClient.prototype.resolveFileFromPointers = function(pointers, mOpts, cb) {
  const self = this;

  if (typeof mOpts === 'function') {
    cb = mOpts;
    mOpts = {};
  }

  const muxer = new FileMuxer({
    shards: mOpts.shards || pointers.length,
    length: mOpts.length || pointers.reduce(function(a, b) {
      return { size: a.size + b.size };
    }, { size: 0 }).size
  });

  function _addInputToMultiplexer(pointer, onInputAdded) {
    const inputStream = self._createInputFromPointer(pointer);
    const exchangeReport = new ExchangeReport({
      reporterId: self._getReporterId(),
      clientId: self._getReporterId(),
      farmerId: pointer.farmer.nodeID
    });

    inputStream.on('error', muxer.emit.bind(muxer, 'error'));
    muxer._shards++;
    muxer.addInputSource(
      inputStream,
      pointer.hash,
      exchangeReport,
      self
    );
    onInputAdded();
  }

  const queue = async.queue(_addInputToMultiplexer, 1);

  function _addPointerToInputQueue(done) {
    queue.push(pointers.shift(), done);
  }

  async.times(
    pointers.length,
    function addInputSource(n, next) {
      _addPointerToInputQueue(next);
    },
    function onInputsAdded() {
      cb(null, muxer, queue);
    }
  );
};

/**
 * Create a readable stream from the given bucket and file id
 * @param {String} bucket - The unique bucket ID
 * @param {String} file - The unique file ID
 * @param {Object} [options]
 * @param {Array} [options.exlude] - Exclude these nodeID's from pointers
 * @param {Function} callback - Receives (err, stream)
 */
BridgeClient.prototype.createFileStream = function(bucket, file, opt, cb) {
  var self = this;
  var skip = -6;
  var limit = 6;
  var resolved = false;
  var bytesExpected = 0;

  if (typeof opt === 'function') {
    cb = opt;
    opt = {};
  }

  function _getFileMetadata(done) {
    self.getFileInfo(bucket, file, function(err, fileInfo) {
      if (err) {
        return done(err);
      }

      bytesExpected = fileInfo.size;
      done();
    });
  }

  function _getPullToken(done) {
    self._logger.info('Creating retrieval token...');
    self.createToken(bucket, 'PULL', function(err, token) {
      if (err) {
        return done(err);
      }
      opt.encryptionKey = token.encryptionKey;
      done(null, token.token);
    });
  }

  function _getPointerSlice(token, done) {
    self._logger.info('Resolving %s file pointers...', limit);
    self.getFilePointers({
      bucket: bucket,
      token: token,
      file: file,
      skip: skip + limit,
      limit: limit,
      exclude: opt.exclude
    }, function(err, pointers) {
      if (err) {
        return done(err);
      }

      skip += limit;
      done(null, pointers);
    });
  }

  function _createStreamAndQueue(pointers, done) {
    self.resolveFileFromPointers(pointers, {
      length: bytesExpected
    }, function(err, stream, queue) {
      if (err) {
        return done(err);
      }

      done(null, stream, queue);
    });
  }

  function _resolveNextSlice(queue, done) {
    _getPullToken(function(err, token) {
      if (err) {
        return done(err);
      }

      _getPointerSlice(token, function(err, pointers) {
        if (err) {
          return done(err);
        }

        if (pointers.length === 0) {
          resolved = true;
          return done();
        }

        self._logger.info(
          'Downloading file slice from %s channels.',
          pointers.length
        );
        async.eachSeries(pointers, queue.push.bind(queue), done);
      });
    });
  }

  async.waterfall([
    _getFileMetadata,
    _getPullToken,
    _getPointerSlice,
    _createStreamAndQueue
  ], function(err, stream, queue) {
    if (err) {
      return cb(err);
    }

    stream.encryptionKey = opt.encryptionKey;
    cb(null, stream); // NB: Provide the stream as soon as it is ready
    async.until(function _pointersAreExhausted() {
      return resolved;
    }, _resolveNextSlice.bind(null, queue), function(err) {
      if (err) {
        stream.emit('error', err);
      }
    });
  });
};

/**
 * Create a stream for a given slice of a file
 * @param {Object} options
 * @param {String} options.bucket - The bucket ID
 * @param {String} options.file - The file ID
 * @param {Number} options.start - The byte position to start slice
 * @param {Number} options.end - The byte position to end slice
 */
BridgeClient.prototype.createFileSliceStream = function(options, callback) {
  var self = this;

  self.getFrameFromFile(options.bucket, options.file, function(err, frame) {
    if (err) {
      return callback(err);
    }

    var sliceOpts = self._getSliceParams(frame, options.start, options.end);

    self.createToken(options.bucket, 'PULL', function(err, token) {
      if (err) {
        return callback(err);
      }

      self.getFilePointers({
        bucket: options.bucket,
        token: token.token,
        file: options.file,
        skip: sliceOpts.skip,
        limit: sliceOpts.limit
      }, function(err, pointers) {
        if (err) {
          return callback(err);
        }

        self.resolveFileFromPointers(pointers, function(err, stream) {
          if (err) {
            return callback(err);
          }

          callback(null, stream.pipe(utils.createStreamTrimmer(
            sliceOpts.trimFront,
            options.end - options.start
          )));
        });
      });
    });
  });
};

/**
 * Sends an exchange report
 * @param {ExchangeReport} exchangeReport - The result of a transfer operation
 */
BridgeClient.prototype.createExchangeReport = function(report) {
  assert(report instanceof ExchangeReport, 'Invalid exchangeReport');
  this._request('POST', '/reports/exchanges', report.toObject(), utils.noop);
};

/**
 * Sends a request to the storj bridge
 * @private
 * @param {String} method - HTTP verb
 * @param {String} path - Endpoint path
 * @param {Object} params - Request parameters
 * @param {Function} callback - Return the raw response stream?
 */
BridgeClient.prototype._request = function(method, path, params, callback) {
  var self = this;
  var currentRequest = null;

  function _request(done) {
    var opts = {
      baseUrl: self._options.baseURI,
      uri: path,
      method: method,
      timeout: self._options.requestTimeout
    };

    params.__nonce = uuid.v4();

    if (['GET', 'DELETE'].indexOf(method) !== -1) {
      opts.qs = params;
      opts.json = true;
    } else {
      opts.json = params;
    }

    self._authenticate(opts);
    self._logger.debug('Request Options: %s', JSON.stringify(opts));

    currentRequest = request(opts, function(err, res, body) {
      self._logger.debug('Response Body: %s', JSON.stringify(body));

      if (err) {
        return done(err);
      }

      if (res.statusCode >= 400) {
        return done(new Error(body.error || body));
      }

      done(null, body);
    });
  }

  async.retry({
    times: 3,
    interval: self._options.retryThrottle,
    errorFilter: (e) => {
      const shouldRetry = ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(e.message);
      self._logger.warn('Request failed, reason: %s - retrying(%s)...',
                        e.message, shouldRetry);
      return shouldRetry;
    }
  }, _request, callback);

  return {
    abort: () => currentRequest.abort()
  };
};

/**
 * Returns a "reporter id"
 * @private
 */
BridgeClient.prototype._getReporterId = function() {
  if (this._options.keyPair) {
    return this._options.keyPair.getPublicKey();
  } else if (this._options.basicAuth) {
    return this._options.basicAuth.email;
  } else {
    return 'anonymous';
  }
};

/**
 * Adds authentication headers to request object
 * @private
 * @param {Object} opts - Options parameter passed to request
 * @return {Object}
 */
BridgeClient.prototype._authenticate = function(opts) {
  var self = this;

  if (this._options.keyPair) {
    var payload = ['GET', 'DELETE'].indexOf(opts.method) !== -1 ?
                  querystring.stringify(opts.qs) :
                  JSON.stringify(opts.json);
    var contract = [opts.method, opts.uri, payload].join('\n');

    self._logger.debug(
      'Parameter for ECDSA signature: %s\\n%s\\n%s',
      opts.method,
      opts.uri,
      payload
    );

    opts.headers = opts.headers || {};
    opts.headers['x-pubkey'] = this._options.keyPair.getPublicKey();
    opts.headers['x-signature'] = this._options.keyPair.sign(contract, {
      compact: false
    });
  } else if (this._options.basicAuth) {
    opts.auth = {
      user: this._options.basicAuth.email,
      pass: utils.sha256(this._options.basicAuth.password, 'utf8')
    };
  }

  return opts;
};

/**
 * Returns the skip/limit params for downloading a file slice
 * @private
 * @param {Object} frame - The frame object from the bridge
 * @param {Number} bytesStart - The starting byte for slice
 * @param {Number} bytesEnd - The ending byte for slice
 */
BridgeClient.prototype._getSliceParams = function(frame, bytesStart, bytesEnd) {
  var skip = 0;
  var limit = 0;
  var count = 0;
  var trimFront = 0;
  var trimBack = 0;
  var trimFrontSet = false;
  var trimBackSet = false;

  frame.shards.forEach(function(shard) {
    count += shard.size;

    if (bytesStart > count) {
      skip++;
    } else if (!trimFrontSet) {
      trimFront = count - bytesStart;
      trimFrontSet = true;
    }

    if (bytesEnd > count) {
      limit++;
    } else if (!trimBackSet){
      trimBack = count - bytesEnd;
      trimBackSet = true;
    }
  });

  return {
    skip: skip,
    limit: limit,
    trimFront: trimFront,
    trimBack: trimBack
  };
};

module.exports = BridgeClient;
