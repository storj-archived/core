'use strict';
var storj = require('storj');
var log = require('./logger')().log;
var path = require('path');
var fs = require('fs');
var platform = require('os').platform();
var prompt = require('prompt');
var os = require('os');
var tmp = require('tmp');
var assert = require('assert');
var rimraf = require('rimraf');

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

module.exports.importkeyring = function(path) {
  var keypass = this._storj.getKeyPass();

  module.exports.getKeyRing(keypass, function(keyring) {
    try {
      fs.statSync(path);
    } catch(err) {
      if (err.code === 'ENOENT') {
        return log('error', 'The supplied tarball does not exist');
      } else {
        return log('error', err.message);
      }
    }

    module.exports.getNewPassword(
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

module.exports.exportkeyring = function(directory) {
  var keypass = this._storj.getKeyPass();

  module.exports.getKeyRing(keypass, function(keyring) {
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

module.exports.changekeyring = function() {
  var keypass = this._storj.getKeyPass();

  module.exports.getKeyRing(keypass, function(keyring) {
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

module.exports.resetkeyring = function() {

  log('info', 'You may lose access to all your stored data if you do this.');
  log('info', 'I recommend you run `storj keyring-export` before deletion.');

  function destroyKeyRing() {
    rimraf.sync(path.join(DATADIR, 'key.ring/'));
    module.exports.getNewPassword(
      'Enter a password for your new keyring',
      function(err, result) {
        try {
          storj.KeyRing(DATADIR, result.password);
        } catch (err) {
          return log('error', 'Could not create keyring, bad password?');
        }
        log('info', 'Successfully created a new key ring.');
      }
    );
  }

  function confirm() {
      module.exports.getConfirmation(
      'Are REALLY you sure you want to destroy your keyring?',
      destroyKeyRing
    );
  }

  module.exports.getConfirmation(
  'Are you sure you want to destroy your keyring?',
  confirm
);

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

module.exports.signmessage = function(privatekey, message, env) {
  var keypair;
  var signature;
  var compact = env.compact;

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

module.exports.prepareaudits = function(num, filepath) {
  var auditgen;
  var input;

  try {
    auditgen = storj.AuditStream(Number(num));
    input = fs.createReadStream(filepath);
  } catch (err) {
    return log('error', err.message);
  }

  log('info', 'Generating challenges and merkle tree...');

  auditgen.on('finish', function() {
    log('info', '');
    log('info', 'Merkle Root');
    log('info', '-----------');
    log('info', auditgen.getPrivateRecord().root);
    log('info', '');
    log('info', 'Challenges');
    log('info', '----------');
    auditgen.getPrivateRecord().challenges.forEach(function(chal) {
      log('info', chal);
    });
    log('info', '');
    log('info', 'Merkle Leaves');
    log('info', '-------------');
    auditgen.getPublicRecord().forEach(function(leaf) {
      log('info', leaf);
    });
  });

  auditgen.on('error', function(err) {
    log('error', err.message);
  });

  input.pipe(auditgen);
};

module.exports.provefile = function(leaves, challenge, filepath) {
  var proofgen;
  var input;
  var tree = leaves.split(',');

  try {
    proofgen = storj.ProofStream(tree, challenge);
    input = fs.createReadStream(filepath);
  } catch (err) {
    return log('error', err.message);
  }

  log('info', 'Generating proof of possession...');

  proofgen.once('data', function(result) {
    log('info', '');
    log('info', 'Challenge Response');
    log('info', '------------------');
    log('info', JSON.stringify(result));
  });

  proofgen.on('error', function(err) {
    log('error', err.message);
  });

  input.pipe(proofgen);
};

module.exports.verifyproof = function(root, depth, resp) {
  var verifier;
  var result;

  log('info', 'Verfifying proof response...');

  try {
    verifier = storj.Verification(JSON.parse(resp));
    result = verifier.verify(root, Number(depth));
  } catch (err) {
    return log('error', err.message);
  }

  (function() {
    log('info', '');
    log('info', 'Expected: %s', [result[1]]);
    log('info', 'Actual:   %s', [result[0]]);
    log('info', '');
  })();

  if (result[0] === result[1]) {
    log('info', 'The proof response is valid');
  } else {
    log('error', 'The proof response is not valid');
  }
};
