'use strict';
var log = require('./../logger')().log;
var storj = require('storj');

module.exports.list = function(page) {
  var client = this._storj.PublicClient();

  client.getContactList({
    page: page,
    connected: this.connected
  }, function(err, contacts) {
    if (err) {
      return log('error', err.message);
    }

    if (!contacts.length) {
      return log('warn', 'There are no contacts to show');
    }

    contacts.forEach(function(contact) {
      log('info', 'Contact:   ' + storj.utils.getContactURL(contact));
      log('info', 'Last Seen: ' + contact.lastSeen);
      log('info', 'Protocol:  ' + (contact.protocol || '?'));
      log('info', '');
    });
  });
};

module.exports.get = function(nodeid) {
  var client = this._storj.PublicClient();

  client.getContactByNodeId(nodeid, function(err, contact) {
    if (err) {
      return log('error', err.message);
    }

    log('info', 'Contact:   %s', [storj.utils.getContactURL(contact)]);
    log('info', 'Last Seen: %s', [contact.lastSeen]);
    log('info', 'Protocol:  %s', [(contact.protocol || '?')]);
  });
};
