'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');

module.exports.list = function() {
  var client = this._storj.PrivateClient();

  client.getPublicKeys(function(err, keys) {
    if (err) {
      return log('error', err.message);
    }

    keys.forEach(function(key) {
      log('info', key.key);
    });
  });
};

module.exports.add = function(pubkey) {
  var client = this._storj.PrivateClient();

  client.addPublicKey(pubkey, function(err) {
    if (err) {
      return log('error', err.message);
    }

    log('info', 'Key successfully registered.');
  });
};

module.exports.remove = function(pubkey, env) {
  var client = this._storj.PrivateClient();

  function destroyKey() {
    client.destroyPublicKey(pubkey, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Key successfully revoked.');
    });
  }

  if (!env.force) {
    return utils.getConfirmation(
      'Are you sure you want to invalidate the public key?',
      destroyKey
    );
  }

  destroyKey();
};
