'use strict';

var storj = require('storj');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// Login using the keypair generated
var client = storj.BridgeClient(api, {keypair: keypair});

var bucketInfo = {
  name: 'Cool bucket',
  storage: 30,
  transfer: 10
};

// Add bucket
client.createBucket(bucketInfo, function(err, bucket) {
  if (err) {
    // Handle error on failure.
    return console.log('error', err.message);
  }

  // Log out bucket info
  console.log(
    'info',
    'ID: %s, Name: %s, Storage: %s, Transfer: %s',
    [bucket.id, bucket.name, bucket.storage, bucket.transfer]
  );

  // Remove bucket by id
  client.destroyBucketById(bucket.id, function(err) {
    if (err) {
      // Handle error on failure.
      return console.log('error', err.message);
    }

    console.log('info', 'Bucket successfully destroyed.');
  });
});
