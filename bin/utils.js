'use strict';
var storj = require('..');
var log = require('./logger')().log;
var path = require('path');
var fs = require('fs');
var platform = require('os').platform();
var prompt = require('prompt');
var os = require('os');
var tmp = require('tmp');
var assert = require('assert');

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

module.exports.importkeyring = function(keypass, path) {
  this.getKeyRing(keypass, function(keyring) {
    try {
      fs.statSync(path);
    } catch(err) {
      if (err.code === 'ENOENT') {
        return log('error', 'The supplied tarball does not exist');
      } else {
        return log('error', err.message);
      }
    }

    this.getNewPassword(
      'Enter password for the keys to be imported',
      function(err, result) {
        if (err) {
          return log('error', err.message);
        }

        keyring.import(path, result.password, function(err) {
          if (err) {
            return log('error', err.message);
          }

          log('info', 'Key ring imported successfully');
        });
      }
    );
  });
};

module.exports.exportkeyring = function(keypass, directory) {
  this.getKeyRing(keypass, function(keyring) {
    try {
      var stat = fs.statSync(directory);
      assert(stat.isDirectory(), 'The path must be a directory');
    } catch(err) {
      if (err.code === 'ENOENT') {
        return log('error', 'The supplied directory does not exist');
      } else {
        return log('error', err.message);
      }
    }

    var tarball = path.join(directory, 'keyring.bak.' + Date.now() + '.tgz');

    keyring.export(tarball, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Key ring backed up to %s', [tarball]);
      log('info', 'Don\'t forget the password for this keyring!');
    });
  });
};

module.exports.resetkeyring = function(keypass) {
  this.getKeyRing(keypass, function(keyring) {
    prompt.start();
    prompt.get({
      properties: {
        passphrase: {
          description: 'Enter a new password for your keyring',
          replace: '*',
          hidden: true,
          default: ''
        }
      }
    }, function(err, result) {
      if (err) {
        return log('error', err.message);
      }

      keyring.reset(result.passphrase, function(err) {
        if (err) {
          return log('error', err.message);
        }

        log('info', 'Password for keyring has been reset.');
      });
    });
  });
};

module.exports.generatekey = function(env) {
  var keypair = storj.KeyPair();

  log('info', 'Private: %s', [keypair.getPrivateKey()]);
  log('info', 'Public:  %s', [keypair.getPublicKey()]);
  log('info', 'NodeID:  %s', [keypair.getNodeID()]);
  log('info', 'Address: %s', [keypair.getAddress()]);

  function savePrivateKey() {
    if (env.save) {
      log('info', '');

      var privkey = keypair.getPrivateKey();

      if (env.encrypt) {
        privkey = storj.utils.simpleEncrypt(env.encrypt, privkey);

        log('info', 'Key will be encrypted with supplied passphrase');
      }

      if (storj.utils.existsSync(env.save)) {
        return log('error', 'Save path already exists, refusing overwrite');
      }

      fs.writeFileSync(env.save, privkey);
      log('info', 'Key saved to %s', [env.save]);
    }
  }

  return savePrivateKey();
};

module.exports.signmessage = function(privatekey, message, compact) {
  var keypair;
  var signature;

  try {
    keypair = storj.KeyPair(privatekey);
  } catch (err) {
    return log('error', 'Invalid private key supplied');
  }

  try {
    signature = keypair.sign(message, { compact: compact });
  } catch (err) {
    return log('error', 'Failed to sign message, reason: %s', [err.message]);
  }

  log('info', 'Signature (%s): %s', [
    compact ? 'compact' : 'complete',
    signature
  ]);
};
