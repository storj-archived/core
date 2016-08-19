'use strict';
var storj = require('..');
var log = require('./logger')().log;
var path = require('path');
var fs = require('fs');
var platform = require('os').platform();
var prompt = require('prompt');
var os = require('os');
var tmp = require('tmp');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
var DATADIR = path.join(HOME, '.storjcli');
var KEYPATH = path.join(DATADIR, 'id_ecdsa');

module.exports.getConfirmation = function(msg, callback) {
  prompt.start();
  prompt.get({
    properties: {
      confirm: {
        description: msg + ' (y/n)',
        required: true
      }
    }
  }, function(err, result) {
    if (result && ['y', 'yes'].indexOf(result.confirm.toLowerCase()) !== -1) {
      callback();
    }
  });
};

module.exports.getNewPassword = function(msg, callback) {
  prompt.start();
  prompt.get({
    properties: {
      password: {
        description: msg,
        required: true,
        replace: '*',
        hidden: true
      }
    }
  }, callback);
};

module.exports.makeTempDir = function(callback) {
  var opts = {
    dir: os.tmpdir(),
    prefix: 'storj-',
    // 0700.
    mode: 448,
    // require manual cleanup.
    keep: true,
    unsafeCleanup: true
  };

  tmp.dir(opts, function(err, path, cleanupCallback) {
    callback(err, path, cleanupCallback);
  });
};

module.exports.getCredentials = function(callback) {
  prompt.start();
  prompt.get({
    properties: {
      email: {
        description: 'Enter your email address',
        required: true
      },
      password: {
        description: 'Enter your password',
        required: true,
        replace: '*',
        hidden: true
      }
    }
  }, callback);
};

module.exports.loadKeyPair = function(){
  if (!storj.utils.existsSync(KEYPATH)) {
    log('error', 'You have not authenticated, please login.');
    process.exit(1);
  }

  return storj.KeyPair(fs.readFileSync(KEYPATH).toString());
};

module.exports.getKeyRing = function(keypass, callback) {
  if (keypass) {
    var keyring;

    try {
      keyring = storj.KeyRing(DATADIR, keypass);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    return callback(keyring);
  }

  var description = storj.utils.existsSync(DATADIR) ?
                    'Enter your passphrase to unlock your keyring' :
                    'Enter a passphrase to protect your keyring';

  prompt.start();
  prompt.get({
    properties: {
      passphrase: {
        description: description,
        replace: '*',
        hidden: true,
        default: '',
        required: true
      }
    }
  }, function(err, result) {
    if (err) {
      return log('error', err.message);
    }

    var keyring;

    try {
      keyring = storj.KeyRing(DATADIR, result.passphrase);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    callback(keyring);
  });
};
