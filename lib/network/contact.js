'use strict';

var kad = require('kad');
var inherits = require('util').inherits;
var version = require('../version');

/**
* Represents a Storj contact (or peer)
* @constructor
* @license LGPL-3.0
* @param {Object} contact
* @param {String} contact.address - Hostname of IP address
* @param {Number} contact.port - RPC port number
* @param {String} contact.nodeID - 160 bit node ID (hex)
* @param {String} [contact.userAgent] - User agent identifier
* @param {String} contact.protocol - Semver tag for compatibility
*/
function Contact(options) {
  if (!(this instanceof Contact)) {
    return new Contact(options);
  }

  this.userAgent = options.userAgent || version.software;
  this.protocol = options.protocol || version.protocol;

  kad.contacts.AddressPortContact.call(this, options);
}

inherits(Contact, kad.contacts.AddressPortContact);

module.exports = Contact;
