'use strict';

var kad = require('kad');
var inherits = require('util').inherits;
var protocol = require('../version').protocol;

/**
* Represents a Storj contact (or peer)
* @constructor
* @license LGPL-3.0
* @param {Object} options
*/
function Contact(options) {
  if (!(this instanceof Contact)) {
    return new Contact(options);
  }

  this.protocol = options.protocol || protocol;

  kad.contacts.AddressPortContact.call(this, options);
}

inherits(Contact, kad.contacts.AddressPortContact);

module.exports = Contact;
