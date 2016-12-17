'use strict';

var assert = require('assert');
var kad = require('kad');
var inherits = require('util').inherits;
var version = require('../version');
var utils = require('../utils');
var url = require('url');

/**
* Represents a Storj contact (or peer)
* @constructor
* @license LGPL-3.0
* @param {Object} contact
* @param {String} contact.address - Hostname of IP address
* @param {Number} contact.port - RPC port number
* @param {String} contact.nodeID - 160 bit node ID (hex)
* @param {String} [contact.hdKey] - extended hd public key
* @param {String} [contact.hdIndex] - derivation index for node
* @param {String} [contact.userAgent] - User agent identifier
* @param {String} contact.protocol - Semver tag for compatibility
*/
function Contact(options) {
  if (!(this instanceof Contact)) {
    return new Contact(options);
  }

  this.userAgent = options.userAgent || version.software;
  this.protocol = options.protocol || version.protocol;

  if (options.hdKey) {
    assert(utils.isValidHDNodeKey(options.hdKey),
           'hdKey is expected to be extended public key');
    assert(utils.isValidNodeIndex(options.hdIndex),
           'hdIndex is expected to be a non-hardened index');
    this.hdKey = options.hdKey;
    this.hdIndex = options.hdIndex;
  } else {
    this.hdKey = undefined;
    this.hdIndex = undefined;
  }

  kad.contacts.AddressPortContact.call(this, options);
}

inherits(Contact, kad.contacts.AddressPortContact);

/**
 * Indicates if URL is valid contact
 * @param {String}
 * @returns {Boolean}
 */
Contact.isValidUrl = function(uri) {
  let contact = null;

  try {
    contact = url.parse(uri);
    assert(contact.protocol === 'storj:', 'Invalid protocol');
    assert(
      Buffer.from(contact.path.substr(1), 'hex').length * 8 === 160,
      'Invalid node ID'
    );
    assert(
      utils.isValidContact(Contact.fromUrl(uri),
                           process.env.STORJ_ALLOW_LOOPBACK),
      'Invalid contact data'
    );
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Returns a Storj contact from the URI
 * @private
 * @param {String} uri
 */
Contact.fromUrl = function(uri) {
  var parsed = url.parse(uri);

  return new Contact({
    address: parsed.hostname,
    port: Number(parsed.port),
    nodeID: parsed.path.substr(1)
  });
};

module.exports = Contact;
