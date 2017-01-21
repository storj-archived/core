'use strict';

var concat = require('concat-stream');

/**
 * Manage a blacklist file containing an object with key value pairs of
 * nodeids: timestamp
 * @constructor
 * @license LGPL-3.0
 * @see https://github.com/storj/bridge
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.store - The store that blacklist enteries will be
 * persisted to. This object must be compatible with the API of
 * [abstract-blob-store](https://github.com/maxogden/abstract-blob-store)
 */
function Blacklist(options) {
  if (!(this instanceof Blacklist)) {
    return new Blacklist(options);
  }

  this.blacklistKey = '.blacklist';
  this._store = options.store;
  this._logger = options.logger;
}

Blacklist.TTL = 86400000;

/**
 * Push node to blacklist
 * @param {String} nodeid - Node id to be added to blacklist
 */
Blacklist.prototype.push = function(nodeid, cb) {
  var self = this;
  self._logger.info('Adding NodeID %s to blacklist', nodeid);
  self._getBlacklist(function() {
    self.blacklist[nodeid] = Date.now();
    self._saveToStore(cb);
  });
};

/**
 * Lazy load blacklist
 * @private
 */
Blacklist.prototype._getBlacklist = function(cb) {
  var self = this;

  // If we already have a blacklist, return it
  if(self.blacklist !== undefined) {
    return cb(null, self.blacklist);
  }

  // Otherwise load it from the store
  return self._loadFromStore(function() {
    return cb(null, self.blacklist);
  });
};

/**
 * Save blacklist to Store
 * @private
 */
Blacklist.prototype._saveToStore = function(cb) {
  var ws = this._store.createWriteStream(this.blacklistKey);
  ws.end(JSON.stringify(this.blacklist), function (e) {
    // Throw to maintain compatibility with fs.writeFileSync
    if(e) { throw e; }
    return cb();
  });
};

/**
 * Read blacklist from Store and Reap old nodeids
 * @private
 */
Blacklist.prototype._loadFromStore = function(cb) {
  var self = this;
  var rs = self._store.createReadStream(self.blacklistKey);
  // If the file doesn't exist, return an empty object.
  rs.on('error', function () {
    self.blacklist = {};
    cb(null, self.blacklist);
  });

  // Get the stream as a string
  var cs = concat(function (data) {
    // default to an empty object
    self.blacklist = {};

    // If the file was empty, return our default. This prevents an error from
    // being displayed to the user.
    if(data === '') {
      return cb(null, self.blacklist);
    }

    try {
      self.blacklist = JSON.parse(data);
    } catch (e) {
      self._logger.warn('Corrupt blacklist data, using a fresh object.');
    }

    // Cleanup stale references and return the file
    return cb(null, self._reap(self.blacklist));
  });
  rs.pipe(cs);
};

/**
  * Reap old nodeids from blacklist
  * @private
  */
Blacklist.prototype._reap = function(blacklist) {
  var now = Date.now();

  for (var nodeid in blacklist) {
    if ((now - blacklist[nodeid]) > Blacklist.TTL) {
      delete blacklist[nodeid];
    }
  }

  this.blacklist = blacklist;

  return blacklist;
};

/**
 * Return list of blacklisted nodeids
 */
Blacklist.prototype.toObject = function(cb) {
  var self = this;
  self._getBlacklist(function() {
    return cb(null, Object.keys(self._reap(self.blacklist)));
  });
};

module.exports = Blacklist;
