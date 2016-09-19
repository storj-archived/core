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

module.exports.getInfo = function(bucketid, fileid, callback) {
  var client = this._storj.PrivateClient();

  client.listFilesInBucket(bucketid, function(err, files) {
    if (err) {
      log('error', err.message);
      return callback(null);
    }

    if (!files.length) {
      log('warn', 'There are no files in this bucket.');
      return callback(null);
    }

    files.forEach(function(file) {
      if (fileid === file.id) {
        log(
          'info',
          'Name: %s, Type: %s, Size: %s bytes, ID: %s',
          [file.filename, file.mimetype, file.size, file.id]
        );
        return callback(file);
      }
    });

    return callback(null);
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

module.exports.mirror = function(bucket, file, env) {
  var client = this._storj.PrivateClient();

  if (parseInt(env.redundancy) > 12 || parseInt(env.redundancy) < 1) {
    return log('error', '%s is an invalid Redundancy value.', env.redundancy);
  }

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
  var destination = filepath;

  if (storj.utils.existsSync(filepath) && fs.statSync(filepath).isFile()) {
    return log('error', 'Refusing to overwrite file at %s', filepath);
  }

  if (!storj.utils.existsSync(path.dirname(filepath))) {
    return log('error', '%s is not an existing folder', path.dirname(filepath));
  } else if(fs.statSync(path.dirname(filepath)).isDirectory() === false) {
    return log('error', '%s is not an existing folder', path.dirname(filepath));
  }

  module.exports.getInfo.call(self, bucket, id, function(file) {
    var target;

    if (file === null) {
      return log('error', 'file %s does not exist in bucket %s', [id, bucket]);
    }

    // Check if path is an existing path
    if (storj.utils.existsSync(filepath) === true ) {
      // Check if given path is a directory
      if (fs.statSync(filepath).isDirectory() && file !== null) {

        // use the file name as the name of the file to be downloaded to
        var fullpath = path.join(filepath,file.filename);

        // Make sure fullpath doesn't already exist
        if (storj.utils.existsSync(fullpath)) {
          return log('error', 'Refusing to overwrite file at %s', fullpath);
        }

        destination = fullpath;
        target = fs.createWriteStream(fullpath);
      } else {
        target = fs.createWriteStream(filepath);
      }
    } else {
      if (filepath.slice(-1) === path.sep) {
        return log('error', '%s is not an existing folder', filepath);
      }
      target = fs.createWriteStream(filepath);
    }

    utils.getKeyRing(keypass, function(keyring) {
      var secret = keyring.get(id);

      if (!secret) {
        return log('error', 'No decryption key found in key ring!');
      }

      var decrypter = new storj.DecryptStream(secret);
      var received = 0;
      var exclude = env.exclude.split(',');

      target.on('finish', function() {
        log('info', 'File downloaded and written to %s.', [destination]);
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
