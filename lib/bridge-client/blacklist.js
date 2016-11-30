'use strict';

var assert = require('assert');
var fs = require('fs');
var utils = require('../utils');
var path = require('path');

/**
 * Manage a blacklist file containing an object with key value pairs of
 * nodeids: timestamp
 * @constructor
 * @license LGPL-3.0
 * @see https://github.com/storj/bridge
 * @param {String} path - blacklist folder location
 */
function Blacklist(folder) {
  if (!(this instanceof Blacklist)) {
    return new Blacklist(folder);
  }

  assert.ok(utils.existsSync(folder), 'Invalid Blacklist Folder');

  this.blacklistFile = path.join(folder,'.blacklist');
  this.blacklist = this._loadFromDisk();
}

Blacklist.TTL = 86400000;

/**
 * Push node to blacklist
 * @param {String} nodeid - Node id to be added to blacklist
 */
Blacklist.prototype.push = function(nodeid) {
  this.blacklist[nodeid] = Date.now();
  this._saveToDisk();
};

/**
 * Save blacklist to disk
 * @private
 */
Blacklist.prototype._saveToDisk = function() {
  fs.writeFileSync(this.blacklistFile, JSON.stringify(this.blacklist));
};

/**
 * Read blacklist from disk and Reap old nodeids
 * @private
 */
Blacklist.prototype._loadFromDisk = function() {
  if (!utils.existsSync(this.blacklistFile)) {
    fs.writeFileSync(this.blacklistFile, JSON.stringify({}));
  }

  return this._reap(JSON.parse(fs.readFileSync(this.blacklistFile)));
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
Blacklist.prototype.toObject = function() {
  return Object.keys(this._reap(this.blacklist));
};

module.exports = Blacklist;
