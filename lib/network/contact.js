'use strict';

var assert = require('assert');
var kad = require('kad');
var inherits = require('util').inherits;
var version = require('../version');
var utils = require('../utils');

/**
* Represents a Storj contact (or peer)
* @constructor
* @license LGPL-3.0
* @param {Object} contact
* @param {String} contact.address - Hostname of IP address
* @param {Number} contact.port - RPC port number
* @param {String} contact.nodeID - 160 bit node ID (hex)
* @param {String} contact.hdNodeKey - extended hd public key
* @param {String} contact.hdNodeIndex - derivation index for node
* @param {String} [contact.userAgent] - User agent identifier
* @param {String} contact.protocol - Semver tag for compatibility
*/
function Contact(options) {
  if (!(this instanceof Contact)) {
    return new Contact(options);
  }

  this.userAgent = options.userAgent || version.software;
  this.protocol = options.protocol || version.protocol;

  if (options.hdNodeKey) {
    assert(utils.isValidHDNodeKey(options.hdNodeKey),
           'hdNodeID is expected to be hex string with length 128');
    assert(utils.isValidInt32(options.hdNodeIndex),
           'hdNodeIndex is expected to be a 32 bit integer');
    this.hdNodeKey = options.hdNodeKey;
    this.hdNodeIndex = options.hdNodeIndex;
  } else {
    this.hdNodeKey = undefined;
    this.hdNodeIndex = undefined;
  }

  kad.contacts.AddressPortContact.call(this, options);
}

inherits(Contact, kad.contacts.AddressPortContact);

module.exports = Contact;
