/**
 * @module storj/utils
 * @license LGPL-3.0
 */

'use strict';

var http = require('http');
var stream = require('readable-stream');
var assert = require('assert');
var HDKey = require('hdkey');
var constants = require('./constants');
var KeyPair = require('./crypto-tools/keypair');
var crypto = require('crypto');
var semver = require('semver');
var ip = require('ip');
var ntp = require('ntp-client');
var bitcore = require('bitcore-lib');
var ECIES = require('bitcore-ecies');
var through = require('through');
var fs = require('fs');
var base58 = bitcore.deps.bs58;
var os = require('os');

/**
 * Returns the SHA-1 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.sha1 = function(input, encoding) {
  return crypto.createHash('sha1').update(input, encoding).digest('hex');
};

/**
 * Returns the SHA-256 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.sha256 = function(input, encoding) {
  return crypto.createHash('sha256').update(input, encoding).digest('hex');
};

/**
 * Returns the SHA-512 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.sha512 = function(input, encoding) {
  return crypto.createHash('sha512').update(input, encoding).digest('hex');
};

/**
 * Returns the RIPEMD-160 hash of the input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.rmd160 = function(input, encoding) {
  return crypto.createHash('rmd160').update(input, encoding).digest('hex');
};

/**
 * Returns the WHIRLPOOL hash of the input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.whirlpool = function(input, encoding) {
  return crypto.createHash('whirlpool').update(input, encoding).digest('hex');
};

/**
 * Returns the RIPEMD-160 SHA-256 hash of this input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.rmd160sha256 = function(input, encoding) {
  return module.exports.rmd160(
    Buffer(module.exports.sha256(input, encoding), 'hex')
  );
};

/**
 * Returns the SHA-1 WHIRLPOOL hash of this input
 * @param {String|Buffer} input - Data to hash
 * @param {String} encoding - The encoding type of the data
 * @returns {String}
 */
module.exports.sha1whirlpool = function(input, encoding) {
  return module.exports.sha1(
    Buffer(module.exports.whirlpool(input, encoding), 'hex')
  );
};

/**
 * Returns the next power of two number
 * @param {Number} number
 * @returns {Number}
 */
module.exports.getNextPowerOfTwo = function(num) {
  return Math.pow(2, Math.ceil(Math.log(num) / Math.log(2)));
};

/**
 * Generates a unique token
 * @returns {String}
 */
module.exports.generateToken = function() {
  return module.exports.rmd160sha256(crypto.randomBytes(512));
};

/**
 * Returns a stringified URL from the supplied contact object
 * @param {Object} contact
 * @param {String} contact.address
 * @param {Number} contact.port
 * @param {String} contact.nodeID
 * @returns {String}
 */
module.exports.getContactURL = function(contact) {
  return [
    'storj://', contact.address, ':', contact.port, '/', contact.nodeID
  ].join('');
};

/**
 * Returns whether or not the supplied semver tag is compatible
 * @param {String} version - The semver tag from the contact
 * @returns {Boolean} compatible
 */
module.exports.isCompatibleVersion = function(version) {
  var local = require('./version').protocol;
  var remote = version;
  var sameMajor = semver.major(local) === semver.major(remote);
  var diffs = ['prerelease', 'prepatch', 'preminor', 'premajor'];

  if (diffs.indexOf(semver.diff(remote, local)) !== -1) {
    return false;
  } else {
    return sameMajor;
  }
};

/**
 * Determines if the supplied contact is valid
 * @param {Contact} contact - The contact information for a given peer
 * @param {Boolean} loopback - Allows contacts that are localhost
 * @returns {Boolean}
 */
module.exports.isValidContact = function(contact, loopback) {
  if (!contact) {
    return false;
  }

  var isValidAddr = ip.isV4Format(contact.address) ||
                    ip.isV6Format(contact.address) ||
                    ip.isPublic(contact.address);
  var isValidPort = contact.port > 0;
  var isAllowedAddr = ip.isLoopback(contact.address) ? !!loopback : true;

  return isValidPort && isValidAddr && isAllowedAddr;
};

/**
 * Determines if a value is hexadecimal string
 * @param {*} a - The value to be tested
 * @returns {Boolean}
 */
module.exports.isHexaString = function(a) {
  if (typeof a !== 'string') {
    return false;
  }
  return /^[0-9a-fA-F]+$/.test(a);
};

/**
 * Creates an ECIES ciper object from a private and a public key
 * @param {String} privateKey - The private key of the sender
 * @param {String} publicKey - The public key of the recipient
 * @returns {Object}
 */
module.exports.createEciesCipher = function(privateKey, publicKey) {
  var cipher = ECIES();

  cipher.privateKey(KeyPair(privateKey)._privkey);
  cipher.publicKey(bitcore.PublicKey.fromDER(Buffer(publicKey, 'hex')));

  return cipher;
};

/**
 * Validates the logger object supplied
 * @private
 */
module.exports.validateLogger = function(logger) {
  return logger && logger.debug && logger.warn && logger.info && logger.error;
};

/**
 * Returns number of bytes from human readable size and unit strings
 * @param {String|Number} size - The size measurement
 * @param {String} unit - The unit of measure (MB|MiB|GB|GiB|TB|TiB)
 * @returns {Number}
 */
module.exports.toNumberBytes = function(size, unit) {
  /* jshint maxcomplexity: 7 */
  switch (unit.toUpperCase()) {
    case 'MB':
      size = Number(size) * Math.pow(1000, 2);
      break;
    case 'GB':
      size = Number(size) * Math.pow(1000, 3);
      break;
    case 'TB':
      size = Number(size) * Math.pow(1000, 4);
      break;
    case 'MIB':
      size = Number(size) * Math.pow(1024, 2);
      break;
    case 'GIB':
      size = Number(size) * Math.pow(1024, 3);
      break;
    case 'TIB':
      size = Number(size) * Math.pow(1024, 4);
      break;
    default:
      throw new Error('Unit must be one of TB, TiB, GB, GiB, MB or MiB');
  }

  return Number(size.toFixed());
};

/**
 * Encrypts the given data with the supplied password and base58 encodes it
 * @param {String} password - The passphrase to use for encryption
 * @param {String} data - The string to encrypt
 * @returns {String}
 */
module.exports.simpleEncrypt = function(password, str) {
  var aes256 = crypto.createCipher('aes-256-cbc', password);
  var a = aes256.update(str, 'utf8');
  var b = aes256.final();
  var buf = new Buffer(a.length + b.length);

  a.copy(buf, 0);
  b.copy(buf, a.length);

  return base58.encode(buf);
};

/**
 * Decrypts the given data with the supplied password and base58 decodes it
 * @param {String} password - The passphrase to use for decryption
 * @param {String} data - The string to decrypt
 * @returns {String}
 */
module.exports.simpleDecrypt = function(password, str) {
  var aes256 = crypto.createDecipher('aes-256-cbc', password);
  var a = aes256.update(new Buffer(base58.decode(str)));
  var b = aes256.final();
  var buf = new Buffer(a.length + b.length);

  a.copy(buf, 0);
  b.copy(buf, a.length);

  return buf.toString('utf8');
};

/**
 * Returns the delta between system time and NTP time
 * @param {Function} callback - Called with (err, delta)
 */
module.exports.getNtpTimeDelta = function(callback) {
  var timeBeforeRequest = new Date();

  ntp.getNetworkTime(
    ntp.defaultNtpServer,
    ntp.defaultNtpPort,
    function(err, networkTime) {
      if (err) {
        return callback(err);
      }

      var timeAfterResponse = new Date();
      var latency = timeAfterResponse - timeBeforeRequest;
      var systemTime = Date.now();
      var delta = networkTime.getTime() - Math.abs(systemTime - latency);

      callback(null, delta);
    }
  );
};

/**
 * Determines if the system clock is syncronized with network
 * @param {Function} callback - Called with (err, delta)
 */
module.exports.ensureNtpClockIsSynchronized = function(callback) {
  module.exports.getNtpTimeDelta(function(err, delta) {
    if (err) {
      return callback(err);
    }

    if (delta > constants.NONCE_EXPIRE) {
      return callback(new Error('System clock is not syncronized with NTP'));
    }

    callback(null, delta);
  });
};

/**
 * Returns a through stream that trims the output based on the given range
 * @param {Number} trimFront - Number of bytes to trim off front of stream
 * @param {Number} totalBytes - The total length of the stream in bytes
 */
module.exports.createStreamTrimmer = function(trimFront, totalBytes) {
  var bytesTrimmedFront = 0;
  var bytesRead = 0;

  return through(function(data) {
    if (trimFront - bytesTrimmedFront > data.length) {
      bytesTrimmedFront += data.length;
      bytesRead += 0;
      this.queue(new Buffer([]));
    } else if (trimFront > bytesTrimmedFront) {
      var frontTrimmedSlice = data.slice(trimFront - bytesTrimmedFront);
      bytesTrimmedFront += data.length;
      bytesRead += frontTrimmedSlice.length;
      this.queue(frontTrimmedSlice);
    } else if (bytesRead < totalBytes) {
      var backTrimmedSlice = data.slice(0, totalBytes - bytesRead);
      bytesRead += backTrimmedSlice.length;
      this.queue(backTrimmedSlice);
    } else {
      this.queue(null);
    }
  });
};

/**
 * Check if file exists
 * @param {String} file - Path to file
 * @returns {Boolean}
 */
module.exports.existsSync = function(file) {
  try {
    fs.statSync(file);
  } catch(err) {
    return false;
  }

  return true;
};

/**
 * Check if a path is a directory
 * @param {String} dirPath - Path to a directory
 * @returns {Boolean}
 */
module.exports.isDirectory = function(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
};

/**
 * Check for env STORJ_TEMP todetermine temp directory
 */
module.exports.tmpdir = function() {
  var tmpdir = process.env.STORJ_TEMP;

  if (
    !tmpdir ||
    (typeof tmpdir === 'undefined') ||
    !module.exports.existsSync(tmpdir)
  ) {
    tmpdir = os.tmpdir();
  }

  return tmpdir;
};

/**
 * Empty function stub
 * @private
 */
module.exports.noop = function() {};

/**
 * Calculate bucket id from a given user id and bucket name
 * @param {String} user - user id
 * @param {String} bucketName - bucket name
 */
module.exports.calculateBucketId = function(user, bucketName) {
  var rmd160sha256 = module.exports.rmd160sha256;
  var hash = rmd160sha256(user + bucketName, 'utf-8');
  return hash.substring(0, 24);
};

/**
 * Calculate file id from a given bucket id and file name
 * @param {String} bucket - bucket id
 * @param {String} fileName - file name
 */
module.exports.calculateFileId = function(bucket, fileName) {
  var rmd160sha256 = module.exports.rmd160sha256;
  var hash = rmd160sha256(bucket + fileName, 'utf-8');
  return hash.substring(0, 24);
};

/**
 * Calculate file id from a user id, bucket name, and file name
 * @param {String} user - user id
 * @param {String} bucketName - bucket name
 * @param {String} fileName - file name
 */
module.exports.calculateFileIdByName = function(user, bucketName, fileName) {
  var bucket = module.exports.calculateBucketId(user, bucketName);
  var hash = module.exports.calculateFileId(bucket, fileName);
  return hash;
};

/**
 * Checks if the supplied HD key is valid (base58 encoded) and proper length
 * @param {String} hdKey - The HD key in base 58 encoding
 * @returns {Boolean} isValidHDKey
 */
module.exports.isValidHDNodeKey = function(hdKey) {
  return typeof hdKey === 'string' &&
    /^[1-9a-km-zA-HJ-NP-Z]{1,111}$/.test(hdKey);
};

/**
 * Checks if the input is a non-hardened HD key index
 * @param {Number} hdIndex - The HD key index
 * @returns {Boolean} isValidHDKeyIndex
 */
module.exports.isValidNodeIndex = function(n) {
  return !Number.isNaN(n) && (parseInt(n) === n) && n >= 0 &&
    n <= constants.MAX_NODE_INDEX;
};

/**
 * Returns a HD key object using corrent key derivation path using the
 * given seed
 * @see https://github.com/Storj/complex
 * @param {Buffer} seed64 - 64 byte seed for generating key
 * @returns {HDKey}
 */
module.exports.createComplexKeyFromSeed = function(seed64) {
  assert(Buffer.isBuffer(seed64), 'Seed must be a buffer');
  assert(seed64.length === 64, 'Seed must be 64 bytes in length');

  var hdKey = HDKey.fromMasterSeed(seed64).derive(
    constants.HD_KEY_DERIVATION_PATH
  );

  return hdKey.privateExtendedKey;
};

/**
 * Returns a request object for uploading a shard to a farmer
 * @param {Contact} farmer - Farmer contact object
 * @param {String} shardHash - The hash of the shard to upload
 * @param {String} transferToken - The authorized transfer token
 * @returns {http.ClientRequest}
 */
module.exports.createShardUploader = function(farmer, hash, token) {
  function _createUploadStream() {
    return http.request({
      method: 'POST',
      protocol: 'http:',
      hostname: farmer.address,
      port: farmer.port,
      path: `/shards/${hash}?token=${token}`,
      headers: {
        'content-type': 'application/octet-stream',
        'x-storj-node-id': farmer.nodeID
      }
    });
  }

  return new stream.Transform({
    transform: function(chunk, encoding, callback) {
      if (!this._uploader) {
        this._uploader = _createUploadStream();
        this._uploader.on('response', this.emit.bind(this, 'response'));
        this._uploader.on('error', (err) => {
          this.unpipe();
          this.emit('error', err);
        });
      }

      this._uploader.write(chunk, encoding, callback);
    },
    flush: function(callback) {
      this._uploader.end();
      callback();
    }
  });
};

/**
 * Returns a request object for downloading a shard from a farmer
 * @param {Contact} farmer - Farmer contact object
 * @param {String} shardHash - The hash of the shard to upload
 * @param {String} transferToken - The authorized transfer token
 * @returns {http.ClientRequest}
 */
module.exports.createShardDownloader = function(farmer, hash, token) {
  function _createDownloadStream() {
    return http.get({
      protocol: 'http:',
      hostname: farmer.address,
      port: farmer.port,
      path: `/shards/${hash}?token=${token}`,
      headers: {
        'content-type': 'application/octet-stream',
        'x-storj-node-id': farmer.nodeID
      }
    });
  }

  return new stream.Readable({
    read: function() {
      if (!this._downloader) {
        this._downloader = _createDownloadStream();
        this._downloader.on('response', (res) => {
          res
            .on('data', this.push.bind(this))
            .on('error', this.emit.bind(this, 'error'))
            .on('end', this.push.bind(this, null));
        })
        .on('error', this.emit.bind(this, 'error'));
      }
    }
  });
};

/**
 * Helper for passing an error only logger callback
 * @param {Logger} logger - Logger object
 * @returns {Function}
 */
module.exports.warnOnError = function(logger) {
  return function(err) {
    if (err) {
      logger.warn(err.message);
    }
  };
};
