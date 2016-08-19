'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');
var fs = require('fs');
var path = require('path');
var through = require('through');
var storj = require('../..');

module.exports.list = function(privateClient, bucketid) {
  privateClient.listFilesInBucket(bucketid, function(err, files) {
    if (err) {
      return log('error', err.message);
    }

    if (!files.length) {
      return log('warn', 'There are no files in this bucket.');
    }

    files.forEach(function(file) {
      log(
        'info',
        'Name: %s, Type: %s, Size: %s bytes, ID: %s',
        [file.filename, file.mimetype, file.size, file.id]
      );
    });
  });
};

module.exports.remove = function(keypass, privateClient, id, fileId, env) {
  function destroyFile() {
    utils.getKeyRing(keypass, function(keyring) {
      privateClient.removeFileFromBucket(id, fileId, function(err) {
        if (err) {
          return log('error', err.message);
        }

        log('info', 'File was successfully removed from bucket.');
        keyring.del(fileId);
      });
    });
  }

  if (!env.force) {
    return utils.getConfirmation(
      'Are you sure you want to destroy the file?',
      destroyFile
    );
  }

  destroyFile();
};

module.exports.upload = function(privateClient, keypass, bucket, filepath, env) {
  if (!storj.utils.existsSync(filepath)) {
    return log('error', 'No file found at %s', filepath);
  }

  var secret = new storj.DataCipherKeyIv();
  var encrypter = new storj.EncryptStream(secret);

  utils.getKeyRing(keypass, function(keyring) {
    log('info', 'Generating encryption key...');
    log('info', 'Encrypting file "%s"', [filepath]);

    utils.makeTempDir(function(err, tmpDir, tmpCleanup) {
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
          privateClient.createToken(
            bucket,
            'PUSH',
            function(err, token) {
              if (err) {
                log('error', err.message);
                return cleanup();
              }

              log('info', 'Storing file, hang tight!');

              privateClient().storeFileInBucket(
                bucket,
                token.token,
                tmppath,
                function(err, file) {
                  if (err) {
                    log('warn', 'Error occurred. Triggering cleanup...');
                    cleanup();
                    return log('error', err.message);
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

                  if (env.redundancy) {
                    return this.mirrors(privateClient, bucket, file.id, env);
                  }

                  process.exit();
                }
              );
            }
          );
        }
      );
    });
  });
};

module.exports.mirror = function(privateClient, bucket, file, env) {
  log(
    'info',
    'Establishing %s mirrors per shard for redundancy',
    [env.redundancy]
  );
  log('info', 'This can take a while, so grab a cocktail...');
  privateClient.replicateFileFromBucket(
    bucket,
    file,
    parseInt(env.redundancy),
    function(err, replicas) {
      if (err) {
        return log('error', err.message);
      }

      replicas.forEach(function(shard) {
        log('info', 'Shard %s mirrored by %s nodes', [
          shard.hash,
          shard.mirrors.length
        ]);
      });

      process.exit();
    }
  );
};

module.exports.download = function(privateClient, keypass, bucket, id, filepath, env) {
  if (storj.utils.existsSync(filepath)) {
    return log('error', 'Refusing to overwrite file at %s', filepath);
  }

  utils.getKeyRing(keypass, function(keyring) {
    var target = fs.createWriteStream(filepath);
    var secret = keyring.get(id);

    if (!secret) {
      return log('error', 'No decryption key found in key ring!');
    }

    var decrypter = new storj.DecryptStream(secret);
    var received = 0;
    var exclude = env.exclude.split(',');

    target.on('finish', function() {
      log('info', 'File downloaded and written to %s.', [filepath]);
    }).on('error', function(err) {
      log('error', err.message);
    });

    privateClient.createFileStream(bucket, id, {
      exclude: exclude
    },function(err, stream) {
      if (err) {
        return log('error', err.message);
      }

      stream.on('error', function(err) {
        log('warn', 'Failed to download shard, reason: %s', [err.message]);
        fs.unlink(filepath, function(unlinkFailed) {
          if (unlinkFailed) {
            return log('error', 'Failed to unlink partial file.');
          }

          if (!err.pointer) {
            return;
          }

          log('info', 'Retrying download from other mirrors...');
          exclude.push(err.pointer.farmer.nodeID);
          this.downloadfile(bucket, id, filepath, {
            exclude: env.exclude.join(',')
          });
        });
      }).pipe(through(function(chunk) {
        received += chunk.length;
        log('info', 'Received %s of %s bytes', [received, stream._length]);
        this.queue(chunk);
      })).pipe(decrypter).pipe(target);
    });
  });
};

module.exports.stream = function(privateClient, keypass, bucket, id, env) {
  utils.getKeyRing(keypass, function(keyring) {
    var secret = keyring.get(id);

    if (!secret) {
      return log('error', 'No decryption key found in key ring!');
    }

    var decrypter = new storj.DecryptStream(secret);
    var exclude = env.exclude.split(',');

    privateClient.createFileStream(bucket, id, function(err, stream) {
      if (err) {
        return process.stderr.write(err.message);
      }

      stream.on('error', function(err) {
        log('warn', 'Failed to download shard, reason: %s', [err.message]);

        if (!err.pointer) {
          return;
        }

        log('info', 'Retrying download from other mirrors...');
        exclude.push(err.pointer.farmer.nodeID);
        this.stream(privateClient, keypass, bucket, id, {
          exclude: env.exclude.join(',')
        });
      }).pipe(decrypter).pipe(process.stdout);
    });
  });
};

module.exports.getpointers = function(privateClient, bucket, id, env) {
  privateClient.createToken(bucket, 'PULL', function(err, token) {
    if (err) {
      return log('error', err.message);
    }

    var skip = Number(env.skip);
    var limit = Number(env.limit);

    privateClient.getFilePointers({
      bucket: bucket,
      file: id,
      token: token.token,
      skip: skip,
      limit: limit
    }, function(err, pointers) {
      if (err) {
        return log('error', err.message);
      }

      if (!pointers.length) {
        return log('warn', 'There are no pointers to return for that range');
      }

      log('info', 'Listing pointers for shards %s - %s', [
        skip, skip + pointers.length - 1
      ]);
      log('info', '-----------------------------------------');
      log('info', '');
      pointers.forEach(function(location, i) {
        log('info', 'Index:  %s', [skip + i]);
        log('info', 'Hash:   %s', [location.hash]);
        log('info', 'Token:  %s', [location.token]);
        log('info', 'Farmer: %s', [
          storj.utils.getContactURL(location.farmer)
        ]);
        log('info', '');
      });
    });
  });
};
