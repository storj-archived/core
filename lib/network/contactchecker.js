'use strict';

var Contact = require('./contact');
var net = require('net');
var assert = require('assert');
var merge = require('merge');

/**
 * Handles checking if a contact is reachable
 * @constructor
 * @param {Object} options
 * @param {Number} options.timeout
 * @extends {EventEmitter}
 */
function ContactChecker(options) {
  if (!(this instanceof ContactChecker)) {
    return new ContactChecker(options);
  }

  this._options = merge(Object.create(ContactChecker.DEFAULTS), options);
}

ContactChecker.DEFAULTS = {
  timeout: 2000
};

/**
 * Opens a connection to the contact to ensure it's reachable
 * @param {Contact} contact - The contact to check
 * @param {Function} callback -
 */
ContactChecker.prototype.check = function(contact, callback) {
  assert(contact instanceof Contact, 'Invalid contact supplied');

  var conn = null;
  var timeout = setTimeout(function() {
    conn.destroy();
    callback(new Error('Host is not reachable'));
  }, this._options.timeout);

  function _connectListener() {
    clearTimeout(timeout);
    conn.destroy();
    callback(null);
  }

  function _errorListener(err) {
    clearTimeout(timeout);
    conn.destroy();
    callback(err);
  }

  conn = net.connect(contact.port, contact.address, _connectListener);

  conn.on('error', _errorListener);
};

module.exports = ContactChecker;
