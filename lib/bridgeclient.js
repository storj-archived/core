'use strict';

var assert = require('assert');
var fs = require('fs');
var querystring = require('querystring');
var request = require('request');
var utils = require('./utils');
var FileDemuxer = require('./filedemuxer');
var FileMuxer = require('./filemuxer');
var AuditStream = require('./auditstream');
var DataChannelClient = require('./datachannel/client');
var Contact = require('./network/contact');
var crypto = require('crypto');
var tmpdir = require('os').tmpdir();
var path = require('path');
var mime = require('mime');
var uuid = require('node-uuid');
var merge = require('merge');
var kad = require('kad');
var EventEmitter = require('events').EventEmitter;

/**
 * Represents a client interface to a given bridge server
 * @constructor
 * @see https://github.com/storj/bridge
 * @param {String} uri - API base URI ('https://api.storj.io')
 * @param {Object} options
 * @param {KeyPair} options.keypair - KeyPair instance for request signing
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.basicauth
 * @param {String} options.basicauth.email - Email address for HTTP basic auth
 * @param {String} options.basicauth.password - Password for HTTP basic auth
 */
function BridgeClient(uri, options) {
  if (!(this instanceof BridgeClient)) {
    return new BridgeClient(uri, options);
  }

  this._options = this._checkOptions(uri, options);
  this._logger = this._options.logger;
}

/**
 * Check the options supplied to the constructor
 * @private
 */
BridgeClient.prototype._checkOptions = function(uri, options) {
  options = merge({
    baseURI: uri || process.env.STORJ_BRIDGE || 'https://api.storj.io',
    logger: new kad.Logger(0)
  }, options);

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
 * Creates a file staging frame
 * @param {Function} callback
 */
BridgeClient.prototype.getFileStagingFrames = function(callback) {
  return this._request('GET', '/frames', {}, callback);
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @param {Function} callback
 */
BridgeClient.prototype.getFileStagingFrameById = function(id, callback) {
  return this._request('GET', '/frames/' + id, {}, callback);
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @param {Function} callback
 */
BridgeClient.prototype.destroyFileStagingFrameById = function(id, callback) {
  return this._request('DELETE', '/frames/' + id, {}, callback);
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @param {Object} shard - The shard metadata
 * @param {Object} options
 * @param {Number} options.retry - Retry the request this many times if failed
 * @param {Function} callback
 */
BridgeClient.prototype.addShardToFileStagingFrame = function(f, s, opt, cb) {
  var self = this;
  var retries = 0;

  if (typeof arguments[2] === 'function') {
    cb = opt;
    opt = { retry: 3 };
  }

  function _addShard() {
    return self._request('PUT', '/frames/' + f, s, function(err, result) {
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

  return _addShard();
};

/**
 * Stores a file in the bucket
 * @param {String} id - Unique bucket ID
 * @param {String} token - Token from {@link BridgeClient#createToken}
 * @param {String} file - Path to file to store
 * @param {Number} shards - Number of shards to create
 * @param {Function} callback
 */
BridgeClient.prototype.storeFileInBucket = function(id, token, file, callback) {
  var self = this;
  var numShards = Math.ceil(
    fs.statSync(file).size / FileDemuxer.DEFAULTS.shardSize
  );
  var completed = 0;
  var cleanMe = [];

  function cleanup() {
    cleanMe.forEach(function(tmpFilePath) {
      fs.unlinkSync(tmpFilePath);
    });
  }

  self.createFileStagingFrame(function(err, frame) {
    if (err) {
      return callback(err);
    }

    var demuxer = new FileDemuxer(file);

    demuxer.on('shard', function(shardStream, index) {
      var tmpName = path.join(tmpdir, crypto.randomBytes(6).toString('hex'));
      var tmpFile = fs.createWriteStream(tmpName);
      var hasher = crypto.createHash('sha256');
      var size = 0;

      self._logger.info('Trying to upload shard %s index %s', tmpName, index);
      cleanMe.push(tmpName);

      shardStream.on('data', function(data) {
        size += data.length;
        hasher.update(data);
        tmpFile.write(data);
      });

      shardStream.on('end', function() {
        tmpFile.end();
      });

      tmpFile.on('finish', function() {
        var hash = utils.rmd160(hasher.digest('hex'));
        self._logger.info('Hash for this shard is: %s', hash);

        var auditGenerator = new AuditStream(3);
        var shardFile = fs.createReadStream(tmpName);

        shardFile.pipe(auditGenerator).on('finish', function() {
          var challenges = auditGenerator.getPrivateRecord().challenges;
          var tree = auditGenerator.getPublicRecord();

          self._logger.info('Audit generation for shard done.');
          self._logger.info('Waiting on a storage offer from the network...');

          self.addShardToFileStagingFrame(frame.id, {
            hash: hash,
            size: size,
            index: index,
            challenges: challenges,
            tree: tree
          }, function(err, pointer) {
            if (err) {
              self._logger.warn('Failed to upload shard...');
              cleanup();
              return callback(err);
            }

            var transferRetryCounter = 0;

            self._logger.info('Contract negotiated with: %j', pointer.farmer);
            var transferStatus = self._transferShard(tmpName, pointer, callback);

            transferStatus.on('retry', function(err) {
              if (transferStatus._eventsCount < 3) {
                self._logger.info('Retrying shard transfer, pointer: %j', pointer);
                self._transferShard(tmpName, pointer, callback);
              } else {
                self._logger.warn('Did not work! I am crashing now..');
              }
            });

            transferStatus.on('finish', function(err) {
              completed++;

              self._logger.info(
                'Shard transfer completed! %s remaining...',
                numShards - completed
              );

              if (completed === numShards) {
                cleanup();

                // NB: use the original filename if called from cli
                var origFileName = path.basename(file).split('.crypt')[0];

                self._logger.info('Transfer finished, creating entry...');
                self._request('POST', '/buckets/' + id + '/files', {
                  frame: frame.id,
                  mimetype: mime.lookup(origFileName),
                  filename: origFileName
                }, callback);
              }
            })
          });
        });
      });
    });
  });
};

/**
 * Transfers a shard to a specified farmer
 * @param {String} tmpName - Path to shard file
 * @param {Object} pointer - Farmer Contact information
 * @param {Function} callback
 */
BridgeClient.prototype._transferShard = function(tmpName, pointer, callback) {
  var self = this;
  var emitter = new EventEmitter();
  var shardFile = fs.createReadStream(tmpName);
  var client = new DataChannelClient(Contact(pointer.farmer));

  client.on('error', function(err) {
    self._logger.warn('Failed to transfer shard, reason: %s', err.message);
    emitter.emit('retry', tmpName, pointer, callback);
    // self._transferShard(tmpName, pointer, callback);
  });

  client.on('open', function() {
    self._logger.info('Data channel opened, transferring shard...');

    var datachannel = client.createWriteStream(
      pointer.token,
      pointer.hash
    );

    shardFile.pipe(datachannel).on('finish', callback);
  });

  return emitter;
};

/**
 * Retrieves a file pointer from the bucket
 * @param {String} bucket - Unique bucket ID
 * @param {String} token - Token from {@link BridgeClient#createToken}
 * @param {String} fileID - The unique file pointer ID
 * @param {Function} callback
 */
BridgeClient.prototype.getFilePointer = function(bucket, token, fileID, cb) {
  var self = this;

  request({
    method: 'GET',
    baseUrl: self._options.baseURI,
    uri: '/buckets/' + bucket + '/files/' + fileID,
    headers: {
      'x-token': token
    },
    json: true
  }, function(err, res, body) {
    if (err) {
      return cb(err);
    }

    if (res.statusCode !== 200 && res.statusCode !== 304) {
      return cb(new Error(body.error || body));
    }

    cb(null, body);
  });
};

/**
 * Open a series of data channels based on the returned value of
 * {@link BridgeClient#getFilePointer} to resolve all the shards and
 * reassemble them together as a binary stream
 * @param {Array} pointers - Result of {@link BridgeClient#getFilePointer}
 * @param {Function} callback
 */
BridgeClient.prototype.resolveFileFromPointers = function(pointers, callback) {
  var opened = 0;
  var size = pointers.reduce(function(a, b) {
    return { size: a.size + b.size };
  }, { size: 0 }).size;
  var muxer = new FileMuxer({
    shards: pointers.length,
    length: size
  });

  pointers.forEach(function(pointer) {
    var dcx = new DataChannelClient(new Contact(pointer.farmer));

    dcx.on('open', function() {
      muxer.input(dcx.createReadStream(pointer.token, pointer.hash));

      opened++;

      if (opened === pointers.length) {
        callback(null, muxer);
      }
    });
  });
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
  var opts = {
    baseUrl: this._options.baseURI,
    uri: path,
    method: method
  };

  params.__nonce = uuid.v4();

  if (['GET', 'DELETE'].indexOf(method) !== -1) {
    opts.qs = params;
    opts.json = true;
  } else {
    opts.json = params;
  }

  this._authenticate(opts);

  request(opts, function(err, res, body) {
    if (err) {
      return callback(err);
    }

    if (res.statusCode >= 400) {
      return callback(new Error(body.error || body));
    }

    callback(null, body);
  });
};

/**
 * Adds authentication headers to request object
 * @private
 * @param {Object} opts - Options parameter passed to request
 * @return {Object}
 */
BridgeClient.prototype._authenticate = function(opts) {
  if (this._options.keypair) {
    var payload = ['GET', 'DELETE'].indexOf(opts.method) !== -1 ?
                  querystring.stringify(opts.qs) :
                  JSON.stringify(opts.json);

    var contract = [opts.method, opts.uri, payload].join('\n');

    opts.headers = opts.headers || {};
    opts.headers['x-pubkey'] = this._options.keypair.getPublicKey();
    opts.headers['x-signature'] = this._options.keypair.sign(contract, {
      compact: false
    });
  } else if (this._options.basicauth) {
    opts.auth = {
      user: this._options.basicauth.email,
      pass: utils.sha256(this._options.basicauth.password, 'utf8')
    };
  }

  return opts;
};

module.exports = BridgeClient;
