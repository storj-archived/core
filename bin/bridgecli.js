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

function loadKeyPair() {
  if (!fs.existsSync(KEYPATH)) {
    log('error', 'You have not authenticated, please login.');
    process.exit();
  }

  return storj.KeyPair(fs.readFileSync(KEYPATH).toString());
}

function PrivateClient() {
  return storj.BridgeClient(program.url, {
    keypair: loadKeyPair()
  });
}

function PublicClient() {
  return storj.BridgeClient(program.url);
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
  uploadfile: function uploadfile(bucket, filepath) {
    if (!fs.existsSync(filepath)) {
      return log('error', 'No file found at %s', filepath);
    }

    var secret = new storj.DataCipherKeyIv();
    var encrypter = new storj.EncryptStream(secret);
    var tmppath = path.join(os.tmpdir(), path.basename(filepath));

    function cleanup() {
      log('info', 'Cleaning up...');
      fs.unlinkSync(tmppath);
    }

    getKeyRing(function(keyring) {
      log('info', 'Generating encryption key...');
      log('info', 'Encrypting file "%s"', [filepath]);

      fs.createReadStream(filepath)
        .pipe(encrypter)
        .pipe(fs.createWriteStream(tmppath)).on('finish', function() {
          log('info', 'Encryption complete!');
          log('info', 'Creating storage token...');
          PrivateClient().createToken(bucket, 'PUSH', function(err, token) {
            if (err) {
              log('error', err.message);
              return cleanup();
            }

            log('info', 'Storing file, hang tight!');

            PrivateClient().storeFileInBucket(
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
              }
            );
          });
        }
      );
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
  streamfile: function downloadfile(bucket, id) {
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

      log('info', 'Contact:   ' + storj.utils.getContactURL(contact));
      log('info', 'Last Seen: ' + contact.lastSeen);
      log('info', 'Protocol:  ' + (contact.protocol || '?'));
    });
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
  .command('getinfo')
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
  .command('listkeys')
  .description('list your registered public keys')
  .action(ACTIONS.listkeys);

program
  .command('addkey <pubkey>')
  .description('register the given public key')
  .action(ACTIONS.addkey);

program
  .command('removekey <pubkey>')
  .description('invalidates the registered public key')
  .action(ACTIONS.removekey);

program
  .command('listbuckets')
  .description('list your storage buckets')
  .action(ACTIONS.listbuckets);

program
  .command('getbucket <id>')
  .description('get specific storage bucket information')
  .action(ACTIONS.getbucket);

program
  .command('addbucket [name] [storage] [transfer]')
  .description('create a new storage bucket')
  .action(ACTIONS.addbucket);

program
  .command('removebucket <id>')
  .description('destroys a specific storage bucket')
  .action(ACTIONS.removebucket);

program
  .command('updatebucket <id> [name] [storage] [transfer]')
  .description('updates a specific storage bucket')
  .action(ACTIONS.updatebucket);

program
  .command('addframe')
  .description('creates a new file staging frame')
  .action(ACTIONS.addframe);

program
  .command('listframes')
  .description('lists your file staging frames')
  .action(ACTIONS.listframes);

program
  .command('getframe <id>')
  .description('retreives the file staging frame by id')
  .action(ACTIONS.getframe);

program
  .command('removeframe <id>')
  .description('removes the file staging frame by id')
  .action(ACTIONS.removeframe);

program
  .command('listfiles <bucket>')
  .description('list the files in a specific storage bucket')
  .action(ACTIONS.listfiles);

program
  .command('removefile <bucket> <id>')
  .description('delete a file pointer from a specific bucket')
  .action(ACTIONS.removefile);

program
  .command('uploadfile <bucket> <filepath>')
  .description('upload a file to the network and track in a bucket')
  .action(ACTIONS.uploadfile);

program
  .command('downloadfile <bucket> <id> <filepath>')
  .description('download a file from the network with a pointer from a bucket')
  .action(ACTIONS.downloadfile);

program
  .command('streamfile <bucket> <id>')
  .description('stream a file from the network and write to stdout')
  .action(ACTIONS.streamfile);

program
  .command('getpointer <bucket> <id>')
  .description('get pointer metadata for a file in a bucket')
  .action(ACTIONS.getpointer);

program
  .command('createtoken <bucket> <operation>')
  .description('create a push or pull token for a file')
  .action(ACTIONS.getfile);

program
  .command('listcontacts [page]')
  .option('-c, --connected', 'limit results to connected nodes')
  .description('list the peers known to the remote bridge')
  .action(ACTIONS.listcontacts);

program
  .command('getcontact <nodeid>')
  .description('get the contact information for a given node id')
  .action(ACTIONS.getcontact);

program
  .command('resetkeyring')
  .description('reset the keyring password')
  .action(ACTIONS.resetkeyring);

program
  .command('*')
  .description('prints the usage information to the console')
  .action(ACTIONS.fallthrough);

program.parse(process.argv);

if (process.argv.length < 3) {
  return program.help();
}
