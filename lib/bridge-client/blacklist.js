'use strict';

var assert = require('assert');
var fs = require('fs');
var utils = require('../utils');
var path = require('path');

/**
 * Blacklist
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
 * Read blacklist from disk
 * @private
 */
Blacklist.prototype._loadFromDisk = function() {
  if (!utils.existsSync(this.blacklistFile)) {
    fs.writeFileSync(this.blacklistFile, JSON.stringify([]));
  }

  return JSON.parse(fs.readFileSync(this.blacklistFile));
};

/**
 * Return list of blacklisted nodeids
 */
Blacklist.prototype.toObject = function() {
  return Object.keys(this.blacklist);
};

module.exports = Blacklist;
