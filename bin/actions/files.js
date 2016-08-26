'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');
var fs = require('fs');
var path = require('path');
var through = require('through');
var storj = require('../..');

module.exports.list = function(bucketid) {
  var client = this._storj.PrivateClient();

  client.listFilesInBucket(bucketid, function(err, files) {
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

module.exports.remove = function(id, fileId, env) {
  var client = this._storj.PrivateClient();
  var keypass = this._storj.getKeyPass();

  function destroyFile() {
    utils.getKeyRing(keypass, function(keyring) {
      client.removeFileFromBucket(id, fileId, function(err) {
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

module.exports.upload = function(bucket, filepath, env) {
  var self = this;
  var client = this._storj.PrivateClient({
    concurrency: env.concurrency ? parseInt(env.concurrency) : 6
  });
  var keypass = this._storj.getKeyPass();

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
          client.createToken(
            bucket,
            'PUSH',
            function(err, token) {
              if (err) {
                log('error', err.message);
                return cleanup();
              }

              log('info', 'Storing file, hang tight!');

              client.storeFileInBucket(
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
                    return module.exports.mirror.call(
                      self,
                      client,
                      bucket,
                      file.id,
                      env
                    );
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

module.exports.mirror = function(bucket, file, env) {
  var client = this._storj.PrivateClient();

  log(
    'info',
    'Establishing %s mirrors per shard for redundancy',
    [env.redundancy]
  );
  log('info', 'This can take a while, so grab a cocktail...');
  client.replicateFileFromBucket(
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

module.exports.download = function(bucket, id, filepath, env) {
  var self = this;
  var client = this._storj.PrivateClient();
  var keypass = this._storj.getKeyPass();

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

    client.createFileStream(bucket, id, {
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
          module.exports.download.call(
            self,
            bucket,
            id,
            filepath,
            { exclude: env.exclude.join(',')}
          );
        });
      }).pipe(through(function(chunk) {
        received += chunk.length;
        log('info', 'Received %s of %s bytes', [received, stream._length]);
        this.queue(chunk);
      })).pipe(decrypter).pipe(target);
    });
  });
};

module.exports.stream = function(bucket, id, env) {
  var self = this;
  var client = this._storj.PrivateClient({
    logger: storj.deps.kad.Logger(0)
  });
  var keypass = this._storj.getKeyPass();

  utils.getKeyRing(keypass, function(keyring) {
    var secret = keyring.get(id);

    if (!secret) {
      return log('error', 'No decryption key found in key ring!');
    }

    var decrypter = new storj.DecryptStream(secret);
    var exclude = env.exclude.split(',');

    client.createFileStream(bucket, id, function(err, stream) {
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
        module.exports.stream.call(
          self,
          bucket,
          id,
          { exclude: env.exclude.join(',') }
        );
      }).pipe(decrypter).pipe(process.stdout);
    });
  });
};

module.exports.getpointers = function(bucket, id, env) {
  var client = this._storj.PrivateClient();

  client.createToken(bucket, 'PULL', function(err, token) {
    if (err) {
      return log('error', err.message);
    }

    var skip = Number(env.skip);
    var limit = Number(env.limit);

    client.getFilePointers({
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
