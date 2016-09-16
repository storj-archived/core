'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');
var fs = require('fs');
var path = require('path');
var storj = require('../..');
var globule = require('globule');
var async = require('async');
var storj = require('../..');

function Uploader(client, keypass, options) {
  if (!(this instanceof Uploader)) {
    return new Uploader(client, keypass, options);
  }

  this.shardConcurrency = options.env.concurrency ?
                    parseInt(options.env.concurrency) :
                    6;
  this.fileConcurrency = options.env.fileconcurrency || 1;
  this.bucket = options.bucket;
  this.redundancy = options.env.redundancy;
  this.client = client({ concurrency: this.shardConcurrency});
  this.keypass = keypass();
  this.filepaths = this._getAllFiles(options.filepath);
  this.fileCount = this.filepaths.length;
  this.uploadedFiles = [];
  this.uploadedCount = 0;

  this._validate();

  log('info', '%s file(s) to upload.', [ this.fileCount ]);
}

/**
 *
 * @private
 */
Uploader.prototype._validate = function() {
  if (this.concurrency > 6) {
    log('warn', 'A concurrency of %s may result in issues!', this.concurrency);
  } else if (this.concurrency < 1) {
    throw new Error('Concurrency cannot be less than 1');
  }

  if (parseInt(this.redundancy) > 12 || parseInt(this.redundancy) < 1) {
    throw new Error(this.redundancy + ' is an invalid Redundancy value.');
  }

  if (this.fileCount < 1) {
      throw new Error('0 files specified to be uploaded.');
  }
};

/**
 *
 * @private
 */
Uploader.prototype._getAllFiles = function(filepath) {
  var filepaths = process.argv.slice();
  var firstFileIndex = filepaths.indexOf(filepath);
  filepaths.splice(0,firstFileIndex);
  var expandedFilepaths = [];

  filepaths.forEach(function(file) {
    // In *NIX the wildcard is already parsed so this will cover other OS's
    var parsedFileArray = globule.find(file);

    if (!storj.utils.existsSync(parsedFileArray[0])) {
      throw new Error(file + ' could not be found');
    }

    if (fs.statSync(parsedFileArray[0]).isFile() === true) {
      try {
        fs.accessSync(parsedFileArray[0], fs.R_OK);
      } catch (err) {
        throw err;
      }

      expandedFilepaths = expandedFilepaths.concat(parsedFileArray);
    }
  });

  return expandedFilepaths;
};

/**
 *
 * @private
 */
Uploader.prototype._handleFailedUpload = function(err, filepath) {
  if (err) {
    throw new Error('[ ' +filepath + ' ] has failed to upload: ' + err);
  }
};

/**
 *
 * @private
 */
Uploader.prototype._cleanup = function(filename, tmpCleanup) {
  log('info', '[ %s ] Cleaning up...', filename);
  tmpCleanup();
  log('info', '[ %s ] Finished cleaning!', filename);
};

/**
 *
 */
Uploader.prototype.start = function() {

  var self = this;
  var fileMeta = [];

  async.waterfall([
    function _getKeyRing(callback) {
      utils.getKeyRing(self.keypass, function(keyring) {
        self.keyring = keyring;
        callback(null);
        return;
      });
    },
    function _beginLoop(callback) {
      log('info', 'Generating encryption key...');

      async.eachLimit(
        self.filepaths,
        self.fileConcurrency,
        function(filepath, nextFileCallback) {
          if (!storj.utils.existsSync(filepath)) {
            callback('No file found.', filepath);
            return;
          }

          self.nextFileCallback = nextFileCallback;

          callback(null, filepath);
        }
      );
    },
    function _makeTempDir(filepath, callback) {
      utils.makeTempDir(function(err, tmpDir, tmpCleanup) {

        if (err) {
          callback(err.message, filepath);
          log('error', 'Unable to create temp directory for file %s', filepath);
          return;
        }

        log('info', 'Encrypting file "%s"', [filepath]);

        var secret = new storj.DataCipherKeyIv();
        var filename = path.basename(filepath);

        fileMeta[filepath] = {
          filename: filename,
          tmpDir: tmpDir,
          tmppath: path.join(tmpDir, filename + '.crypt'),
          tmpCleanup: tmpCleanup,
          secret: secret,
          encrypter: new storj.EncryptStream(secret)
        };

        callback(null, filepath);
      });
    },
    function _createReadStream(filepath, callback) {
      fs.createReadStream(filepath)
        .pipe(fileMeta[filepath].encrypter)
        .pipe(fs.createWriteStream(fileMeta[filepath].tmppath))
        .on('finish', function() {
          log(
            'info',
            '[ %s ] Encryption complete',
            fileMeta[filepath].filename
          );
          callback(null, filepath);
      });
    },
    function _createToken(filepath, callback) {
      var filename = fileMeta[filepath].filename;

      log(
        'info',
        '[ %s ] Creating storage token...',
        filename
      );

      self.client.createToken(self.bucket, 'PUSH', function(err, token) {
        if (err) {
          callback(err.message, filepath);
          self._cleanup(filename, fileMeta[filepath].tmpCleanup);
          return;
        }

        callback(null, filepath, token);
      });
    },
    function _storeFileInBucket(filepath, token, callback) {
      var filename = fileMeta[filepath].filename;

      log('info', '[ %s ] Storing file, hang tight!', filename);

      self.client.storeFileInBucket(
        self.bucket,
        token.token,
        fileMeta[filepath].tmppath,
        function(err, file) {
          if (err) {
            log(
              'warn',
              '[ %s ] Error occurred. Triggering cleanup...',
              filename
             );
            self._cleanup(filename, fileMeta[filepath].tmpCleanup);
            callback(err.message, filepath);
            return;
          }

          self.keyring.set(file.id, fileMeta[filepath].secret);
          self._cleanup(filename, fileMeta[filepath].tmpCleanup);
          log(
            'info',
            '[ %s ] Encryption key saved to keyring.',
            filename
          );

          log(
            'info',
            '[ %s ] File successfully stored in bucket.',
            filename
          );

          log(
            'info',
            'Name: %s, Type: %s, Size: %s bytes, ID: %s',
            [file.filename, file.mimetype, file.size, file.id]
          );

          if (self.redundancy) {
            return module.exports.mirror.call(
              self,
              self.bucket,
              file.id,
              self.env
            );
          }

          self.uploadedCount++;

          log(
            'info',
            '%s of %s files uploaded',
            [ self.uploadedCount, self.fileCount ]
          );
          
          if (self.uploadedCount === self.fileCount) {
            log( 'info', 'Done.');
            callback(null, filepath);
          }

          self.nextFileCallback();

        }
      );
    }
  ], function (err, filepath) {
    self._handleFailedUpload(err, filepath);
  });

};


module.exports = Uploader;
