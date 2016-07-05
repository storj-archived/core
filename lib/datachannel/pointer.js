'use strict';

var assert = require('assert');
var Contact = require('../network/contact');

/**
 * Represents a pointer for opening a {@link DataChannelClient} stream
 * @constructor
 * @param {Contact} contact - The farmer the pointer is for
 * @param {String} hash - The hash of the data to consign or retrieve
 * @param {String} token - The authorization token fot the operation
 * @param {String} [operation=PULL] - The type of operation (PUSH or PULL)
 */
function DataChannelPointer(contact, hash, token, operation) {
  if (!(this instanceof DataChannelPointer)) {
    return new DataChannelPointer(contact, hash, token, operation);
  }

  assert(contact instanceof Contact, 'Invalid contact supplied');
  assert(typeof hash === 'string', 'Invalid hash supplied');
  assert(hash.length === 40, 'Invalid hash supplied');
  assert(typeof token === 'string', 'Invalid token supplied');
  assert(token.length === 40, 'Invalid token supplied');

  this.farmer = contact;
  this.hash = hash;
  this.token = token;
  this.operation = operation || 'PULL';
}

module.exports = DataChannelPointer;
