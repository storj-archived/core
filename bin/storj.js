#!/usr/bin/env node

'use strict';

var program = require('commander');
var fs = require('fs');
var platform = require('os').platform();
var path = require('path');
var prompt = require('prompt');
var colors = require('colors/safe');
var through = require('through');
var storj = require('..');
var os = require('os');
var tmp = require('tmp');
var merge = require('merge');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
var DATADIR = path.join(HOME, '.storjcli');
var KEYPATH = path.join(DATADIR, 'id_ecdsa');
var KEYRINGPATH = path.join(DATADIR, 'keyring');

if (!fs.existsSync(DATADIR)) {
  fs.mkdirSync(DATADIR);
}

prompt.message = colors.bold.cyan(' [...]');
prompt.delimiter = colors.cyan('  > ');

program.version(require('../package').version);
program.option('-u, --url <url>', 'set the base url for the api');
program.option('-k, --keypass <password>', 'unlock keyring without prompt');

function log(type, message, args) {
  switch (type) {
    case 'debug':
      message = colors.bold.magena(' [debug]  ') + message;
      break;
    case 'info':
      message = colors.bold.cyan(' [info]   ') + message;
      break;
    case 'warn':
      message = colors.bold.yellow(' [warn]   ') + message;
      break;
    case 'error':
      message = colors.bold.red(' [error]  ') + message;
      break;
  }

  console.log.apply(console, [message].concat(args || []));
}

log._logger = function() {
  var type = arguments[0];
  var message = arguments[1];
  var values = Array.prototype.slice.call(arguments, 2);

  log(type, message, values);
};

log.info = log._logger.bind(null, 'info');
log.debug = log._logger.bind(null, 'debug');
log.warn = log._logger.bind(null, 'warn');
log.error = log._logger.bind(null, 'error');

function makeTempDir(callback) {
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
}

function loadKeyPair() {
  if (!fs.existsSync(KEYPATH)) {
    log('error', 'You have not authenticated, please login.');
    process.exit();
  }

  return storj.KeyPair(fs.readFileSync(KEYPATH).toString());
}

function PrivateClient(options) {
  return storj.BridgeClient(program.url, merge({
    keypair: loadKeyPair(),
    logger: log
  }, options));
}

function PublicClient() {
  return storj.BridgeClient(program.url, { logger: log });
}

function getKeyRing(callback) {
  if (program.keypass) {
    var keyring;

    try {
      keyring = storj.KeyRing(KEYRINGPATH, program.keypass);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    return callback(keyring);
  }

  var description = fs.existsSync(KEYRINGPATH) ?
                    'Enter your passphrase to unlock your keyring' :
                    'Enter a passphrase to protect your keyring';

  prompt.start();
  prompt.get({
    properties: {
      passphrase: {
        description: description,
        replace: '*',
        hidden: true,
        default: ''
      }
    }
  }, function(err, result) {
    if (err) {
      return log('error', err.message);
    }

    var keyring;

    try {
      keyring = storj.KeyRing(KEYRINGPATH, result.passphrase);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    callback(keyring);
  });
}

function getNewPassword(callback) {
  prompt.start();
  prompt.get({
    properties: {
      password: {
        description: 'Enter your new desired password',
        required: true,
        replace: '*',
        hidden: true
      }
    }
  }, callback);
}

function getCredentials(callback) {
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
}

var ACTIONS = {
  getinfo: function getinfo() {
    PublicClient().getInfo(function(err, info) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Title:             %s', [info.info.title]);
      log('info', 'Description:       %s', [info.info.description]);
      log('info', 'Version:           %s', [info.info.version]);
      log('info', 'Host:              %s', [info.host]);
      info.info['x-network-seeds'].forEach(function(seed, i) {
        log('info', 'Network Seed (%s):  %s', [i, seed]);
      });
    });
  },
  register: function register() {
    getCredentials(function(err, result) {
      if (err) {
        return log('error', err.message);
      }

      PublicClient().createUser({
        email: result.email,
        password: result.password
      }, function(err) {
        if (err) {
          return log('error', err.message);
        }

        log('info', 'Registered! Check your email to activate your account.');
      });
    });
  },
  login: function login() {
    if (fs.existsSync(KEYPATH)) {
      return log('error', 'This device is already paired.');
    }

    getCredentials(function(err, result) {
      if (err) {
        return log('error', err.message);
      }

      var client = storj.BridgeClient(program.url, {
        basicauth: result
      });
      var keypair = storj.KeyPair();

      client.addPublicKey(keypair.getPublicKey(), function(err) {
        if (err) {
          return log('error', err.message);
        }

        fs.writeFileSync(KEYPATH, keypair.getPrivateKey());
        log('info', 'This device has been successfully paired.');
      });
    });
  },
  logout: function logout() {
    var keypair = loadKeyPair();

    PrivateClient().destroyPublicKey(keypair.getPublicKey(), function(err) {
      if (err) {
        log('info', 'This device has been successfully unpaired.');
        log('warn', 'Failed to revoke key, you may need to do it manually.');
        log('warn', 'Reason: ' + err.message);
        return fs.unlinkSync(KEYPATH);
      }

      fs.unlinkSync(KEYPATH);
      log('info', 'This device has been successfully unpaired.');
    });
  },
  resetpassword: function resetpassword(email) {
    getNewPassword(function(err, result) {
      PublicClient().resetPassword({
        email: email,
        password: result.password
      }, function(err) {
        if (err) {
          return log('error', 'Failed to request password reset, reason: %s', [
            err.message
          ]);
        }

        log(
          'info',
          'Password reset request processed, check your email to continue.'
        );
      });
    });
  },
  listkeys: function listkeys() {
    PrivateClient().getPublicKeys(function(err, keys) {
      if (err) {
        return log('error', err.message);
      }

      keys.forEach(function(key) {
        log('info', key.key);
      });
    });
  },
  addkey: function addkey(pubkey) {
    PrivateClient().addPublicKey(pubkey, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Key successfully registered.');
    });
  },
  removekey: function removekey(pubkey) {
    PrivateClient().destroyPublicKey(pubkey, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Key successfully revoked.');
    });
  },
  listbuckets: function listbuckets() {
    PrivateClient().getBuckets(function(err, buckets) {
      if (err) {
        return log('error', err.message);
      }

      if (!buckets.length) {
        return log('warn', 'You have not created any buckets.');
      }

      buckets.forEach(function(bucket) {
        log(
          'info',
          'ID: %s, Name: %s, Storage: %s, Transfer: %s',
          [bucket.id, bucket.name, bucket.storage, bucket.transfer]
        );
      });
    });
  },
  getbucket: function showbucket(id) {
    PrivateClient().getBucketById(id, function(err, bucket) {
      if (err) {
        return log('error', err.message);
      }

      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    });
  },
  removebucket: function removebucket(id) {
    PrivateClient().destroyBucketById(id, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Bucket successfully destroyed.');
    });
  },
  addbucket: function addbucket(name, storage, transfer) {
    PrivateClient().createBucket({
      name: name,
      storage: storage,
      transfer: transfer
    }, function(err, bucket) {
      if (err) {
        return log('error', err.message);
      }

      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    });
  },
  updatebucket: function updatebucket(id, name, storage, transfer) {
    PrivateClient().updateBucketById(id, {
      name: name,
      storage: storage,
      transfer: transfer
    }, function(err, bucket) {
      if (err) {
        return log('error', err.message);
      }

      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    });
  },
  listfiles: function listfiles(id) {
    PrivateClient().listFilesInBucket(id, function(err, files) {
      if (err) {
        return log('error', err.message);
      }

      if (!files.length) {
        return log('warn', 'There are not files in this bucket.');
      }

      files.forEach(function(file) {
        log(
          'info',
          'Name: %s, Type: %s, Size: %s bytes, ID: %s',
          [file.filename, file.mimetype, file.size, file.id]
        );
      });
    });
  },
  removefile: function removefile(id, fileId) {
    PrivateClient().removeFileFromBucket(id, fileId, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'File was successfully removed from bucket.');
    });
  },
  uploadfile: function uploadfile(bucket, filepath, env) {
    if (!fs.existsSync(filepath)) {
      return log('error', 'No file found at %s', filepath);
    }

    var secret = new storj.DataCipherKeyIv();
    var encrypter = new storj.EncryptStream(secret);

    getKeyRing(function(keyring) {
      log('info', 'Generating encryption key...');
      log('info', 'Encrypting file "%s"', [filepath]);

      makeTempDir(function(err, tmpDir, tmpCleanup) {
        if (err) {
          return log('error', err.message);
        }

        var tmppath = path.join(tmpDir, path.basename(filepath) + '.crypt');

        function cleanup() {
          log('info', 'Cleaning up...');
          tmpCleanup();
          log('info', 'Finished cleaning!');
        }

        fs.createReadStream(filepath)
          .pipe(encrypter)
          .pipe(fs.createWriteStream(tmppath)).on('finish', function() {
            log('info', 'Encryption complete!');
            log('info', 'Creating storage token...');
            PrivateClient().createToken(
              bucket,
              'PUSH',
              function(err, token) {
                if (err) {
                  log('error', err.message);
                  return cleanup();
                }

                log('info', 'Storing file, hang tight!');

                PrivateClient({
                  concurrency: parseInt(env.concurrency)
                }).storeFileInBucket(
                  bucket,
                  token.token,
                  tmppath,
                  function(err, file) {
                    if (err) {
                      log('error', err.message);
                      return cleanup();
                    }

                    keyring.set(file.id, secret);
                    cleanup();
                    log('info', 'Encryption key saved to keyring.');
                    log('info', 'File successfully stored in bucket.');
                    log(
                      'info',
                      'Name: %s, Type: %s, Size: %s bytes, ID: %s',
                      [file.filename, file.mimetype, file.size, file.id]
                    );
                    process.exit();
                  }
                );
              }
            );
          }
        );
      });
    });
  },
  getpointer: function getpointer(bucket, id) {
    PrivateClient().createToken(bucket, 'PULL', function(err, token) {
      if (err) {
        return log('error', err.message);
      }

      PrivateClient().getFilePointer(
        bucket,
        token.token,
        id,
        function(err, pointer) {
          if (err) {
            return log('error', err.message);
          }

          pointer.forEach(function(location) {
            log(
              'info',
              'Hash: %s, Token: %s, Farmer: %j',
              [location.hash, location.token, location.farmer]
            );
          });
        }
      );
    });
  },
  addframe: function addframe() {
    PrivateClient().createFileStagingFrame(function(err, frame) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'ID: %s, Created: %s', [frame.id, frame.created]);
    });
  },
  listframes: function listframes() {
    PrivateClient().getFileStagingFrames(function(err, frames) {
      if (err) {
        return log('error', err.message);
      }

      if (!frames.length) {
        return log('warn', 'There are no frames to list.');
      }

      frames.forEach(function(frame) {
        log(
          'info',
          'ID: %s, Created: %s, Shards: %s',
          [frame.id, frame.created, frame.shards.length]
        );
      });
    });
  },
  getframe: function getframe(frame) {
    PrivateClient().getFileStagingFrameById(frame, function(err, frame) {
      if (err) {
        return log('error', err.message);
      }

      log(
        'info',
        'ID: %s, Created: %s, Shards: %s',
        [frame.id, frame.created, frame.shards.length]
      );
    });
  },
  removeframe: function removeframe(frame) {
    PrivateClient().destroyFileStagingFrameById(frame, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Frame was successfully removed.');
    });
  },
  downloadfile: function downloadfile(bucket, id, filepath) {
    if (fs.existsSync(filepath)) {
      return log('error', 'Refusing to overwrite file at %s', filepath);
    }

    getKeyRing(function(keyring) {
      log('info', 'Creating retrieval token...');
      PrivateClient().createToken(bucket, 'PULL', function(err, token) {
        if (err) {
          return log('error', err.message);
        }

        log('info', 'Resolving file pointer...');
        PrivateClient().getFilePointer(
          bucket,
          token.token,
          id,
          function(err, pointer) {
            if (err) {
              return log('error', err.message);
            }

            log('info', 'Downloading file from %s channels.', [pointer.length]);
            var target = fs.createWriteStream(filepath);
            var secret = keyring.get(id);

            if (!secret) {
              return log('error', 'No decryption key found in key ring!');
            }

            var decrypter = new storj.DecryptStream(secret);

            target.on('finish', function() {
              log('info', 'File downloaded and written to %s.', [filepath]);
            }).on('error', function(err) {
              log('error', err.message);
            });

            PrivateClient().resolveFileFromPointers(
              pointer,
              function(err, stream) {
                if (err) {
                  return log('error', err.message);
                }

                stream.on('error', function(err) {
                  log('error', err.message);
                }).pipe(through(function(chunk) {
                  log('info', 'Received %s bytes of data', [chunk.length]);
                  this.queue(chunk);
                })).pipe(decrypter).pipe(target);
              }
            );
          }
        );
      });
    });
  },
  createtoken: function createtoken(bucket, operation) {
    PrivateClient().createToken(bucket, operation, function(err, token) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Token successfully created.');
      log(
        'info',
        'Token: %s, Bucket: %s, Operation: %s',
        [token.token, token.bucket, token.operation]
      );
    });
  },
  streamfile: function streamfile(bucket, id) {
    getKeyRing(function(keyring) {
      var secret = keyring.get(id);

      if (!secret) {
        return log('error', 'No decryption key found in key ring!');
      }

      var decrypter = new storj.DecryptStream(secret);

      PrivateClient().createToken(bucket, 'PULL', function(err, token) {
        if (err) {
          return log('error', err.message);
        }

        PrivateClient().getFilePointer(
          bucket,
          token.token,
          id,
          function(err, pointer) {
            if (err) {
              return process.stderr.write(err.message);
            }

            PrivateClient().resolveFileFromPointers(
              pointer,
              function(err, stream) {
                if (err) {
                  return process.stderr.write(err.message);
                }

                stream.pipe(decrypter).pipe(process.stdout);
              }
            );
          }
        );
      });
    });
  },
  resetkeyring: function resetkeyring() {
    getKeyRing(function(keyring) {
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

        keyring._pass = result.passphrase;
        keyring._saveKeyRingToDisk();
        log('info', 'Password for keyring has been reset.');
      });
    });
  },
  listcontacts: function listcontacts(page) {
    PublicClient().getContactList({
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
  },
  getcontact: function getcontact(nodeid) {
    PublicClient().getContactByNodeId(nodeid, function(err, contact) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Contact:   %s', [storj.utils.getContactURL(contact)]);
      log('info', 'Last Seen: %s', [contact.lastSeen]);
      log('info', 'Protocol:  %s', [(contact.protocol || '?')]);
    });
  },
  generatekey: function generatekey(env) {
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

        if (fs.existsSync(env.save)) {
          return log('error', 'Save path already exists, refusing overwrite');
        }

        fs.writeFileSync(env.save, privkey);
        log('info', 'Key saved to %s', [env.save]);
      }
    }

    return savePrivateKey();
  },
  signmessage: function signmessage(privatekey, message) {
    var keypair;
    var signature;

    try {
      keypair = storj.KeyPair(privatekey);
    } catch (err) {
      return log('error', 'Invalid private key supplied');
    }

    try {
      signature = keypair.sign(message, { compact: this.compact });
    } catch (err) {
      return log('error', 'Failed to sign message, reason: %s', [err.message]);
    }

    log('info', 'Signature (%s): %s', [
      this.compact ? 'compact' : 'complete',
      signature
    ]);
  },
  prepareaudits: function prepareaudits(num, filepath) {
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
  },
  provefile: function provefile(leaves, challenge, filepath) {
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
  },
  verifyproof: function verifyproof(root, depth, resp) {
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
  },
  fallthrough: function(command) {
    log(
      'error',
      'Unknown command "%s", please use --help for assistance',
      command
    );
    program.help();
  }
};

program
  .command('get-info')
  .description('get remote api information')
  .action(ACTIONS.getinfo);

program
  .command('register')
  .description('register a new account with the storj api')
  .action(ACTIONS.register);

program
  .command('login')
  .description('authorize this device to access your storj api account')
  .action(ACTIONS.login);

program
  .command('logout')
  .description('revoke this device\'s access your storj api account')
  .action(ACTIONS.logout);

program
  .command('reset-password <email>')
  .description('request an account password reset email')
  .action(ACTIONS.resetpassword);

program
  .command('list-keys')
  .description('list your registered public keys')
  .action(ACTIONS.listkeys);

program
  .command('add-key <pubkey>')
  .description('register the given public key')
  .action(ACTIONS.addkey);

program
  .command('remove-key <pubkey>')
  .description('invalidates the registered public key')
  .action(ACTIONS.removekey);

program
  .command('list-buckets')
  .description('list your storage buckets')
  .action(ACTIONS.listbuckets);

program
  .command('get-bucket <id>')
  .description('get specific storage bucket information')
  .action(ACTIONS.getbucket);

program
  .command('add-bucket [name] [storage] [transfer]')
  .description('create a new storage bucket')
  .action(ACTIONS.addbucket);

program
  .command('remove-bucket <id>')
  .description('destroys a specific storage bucket')
  .action(ACTIONS.removebucket);

program
  .command('update-bucket <id> [name] [storage] [transfer]')
  .description('updates a specific storage bucket')
  .action(ACTIONS.updatebucket);

program
  .command('add-frame')
  .description('creates a new file staging frame')
  .action(ACTIONS.addframe);

program
  .command('list-frames')
  .description('lists your file staging frames')
  .action(ACTIONS.listframes);

program
  .command('get-frame <id>')
  .description('retreives the file staging frame by id')
  .action(ACTIONS.getframe);

program
  .command('remove-frame <id>')
  .description('removes the file staging frame by id')
  .action(ACTIONS.removeframe);

program
  .command('list-files <bucket>')
  .description('list the files in a specific storage bucket')
  .action(ACTIONS.listfiles);

program
  .command('remove-file <bucket> <id>')
  .description('delete a file pointer from a specific bucket')
  .action(ACTIONS.removefile);

program
  .command('upload-file <bucket> <filepath>')
  .option('-c, --concurrency <count>', 'max upload concurrency')
  .description('upload a file to the network and track in a bucket')
  .action(ACTIONS.uploadfile);

program
  .command('download-file <bucket> <id> <filepath>')
  .description('download a file from the network with a pointer from a bucket')
  .action(ACTIONS.downloadfile);

program
  .command('stream-file <bucket> <id>')
  .description('stream a file from the network and write to stdout')
  .action(ACTIONS.streamfile);

program
  .command('get-pointer <bucket> <id>')
  .description('get pointer metadata for a file in a bucket')
  .action(ACTIONS.getpointer);

program
  .command('create-token <bucket> <operation>')
  .description('create a push or pull token for a file')
  .action(ACTIONS.getfile);

program
  .command('list-contacts [page]')
  .option('-c, --connected', 'limit results to connected nodes')
  .description('list the peers known to the remote bridge')
  .action(ACTIONS.listcontacts);

program
  .command('get-contact <nodeid>')
  .description('get the contact information for a given node id')
  .action(ACTIONS.getcontact);

program
  .command('reset-keyring')
  .description('reset the keyring password')
  .action(ACTIONS.resetkeyring);

program
  .command('generate-key')
  .option('-s, --save <path>', 'save the generated private key')
  .option('-e, --encrypt <passphrase>', 'encrypt the generated private key')
  .description('generate a new ecdsa key pair and print it')
  .action(ACTIONS.generatekey);

program
  .command('sign-message <privatekey> <message>')
  .option('-c, --compact', 'use bitcoin-style compact signature')
  .description('signs the message using the supplied private key')
  .action(ACTIONS.signmessage);

program
  .command('prepare-audits <total> <filepath>')
  .description('generates a series of challenges used to prove file possession')
  .action(ACTIONS.prepareaudits);

program
  .command('prove-file <merkleleaves> <challenge> <filepath>')
  .description('generates a proof from the comma-delimited tree and challenge')
  .action(ACTIONS.provefile);

program
  .command('verify-proof <root> <depth> <proof>')
  .description('verifies the proof response given the merkle root and depth')
  .action(ACTIONS.verifyproof);

program
  .command('*')
  .description('prints the usage information to the console')
  .action(ACTIONS.fallthrough);

program.parse(process.argv);

if (process.argv.length < 3) {
  return program.help();
}
