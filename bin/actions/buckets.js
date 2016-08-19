'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');

module.exports.list = function(privateClient) {
  privateClient.getBuckets(function(err, buckets) {
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

module.exports.get = function(privateClient, id) {
  privateClient.getBucketById(id, function(err, bucket) {
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

module.exports.remove = function(privateClient, id, env) {
  function destroyBucket() {
    privateClient.destroyBucketById(id, function(err) {
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

module.exports.add = function(privateClient, name, storage, transfer) {
  privateClient.createBucket({
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

module.exports.update = function(privateClient, id, name, storage, transfer) {
  privateClient.updateBucketById(id, {
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
