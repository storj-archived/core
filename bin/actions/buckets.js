'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');

module.exports.list = function() {
  var client = this._storj.PrivateClient();

  client.getBuckets(function(err, buckets) {
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
};

module.exports.get = function(id) {
  var client = this._storj.PrivateClient();

  client.getBucketById(id, function(err, bucket) {
    if (err) {
      return log('error', err.message);
    }

    log(
      'info',
      'ID: %s, Name: %s, Storage: %s, Transfer: %s',
      [bucket.id, bucket.name, bucket.storage, bucket.transfer]
    );
  });
};

module.exports.remove = function(id, env) {
  var client = this._storj.PrivateClient();

  function destroyBucket() {
    client.destroyBucketById(id, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Bucket successfully destroyed.');
    });
  }

  if (!env.force) {
    return utils.getConfirmation(
      'Are you sure you want to destroy this bucket?',
      destroyBucket
    );
  }

  destroyBucket();
};

module.exports.add = function(name, storage, transfer) {
  var client = this._storj.PrivateClient();

  client.createBucket({
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
};

module.exports.update = function(id, name, storage, transfer) {
  var client = this._storj.PrivateClient();

  client.updateBucketById(id, {
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
};

module.exports.createtoken = function(bucket, operation) {
  var client = this._storj.PrivateClient();

  client.createToken(bucket, operation, function(err, token) {
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
};
