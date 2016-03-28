'use strict';

var kad = require('kad');
var inherits = require('util').inherits;

/**
* Represents a Storj contact (or peer)
* @constructor
* @param {Object} options
*/
function StorjContact(options) {
  if (!(this instanceof StorjContact)) {
    return new StorjContact(options);
  }

  this.protocol = require('../../package').version;

  kad.contacts.AddressPortContact.call(this, options);
}

inherits(StorjContact, kad.contacts.AddressPortContact);

module.exports = StorjContact;
