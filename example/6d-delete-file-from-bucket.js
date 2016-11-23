'use strict';

var storj = require('storj-lib');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// console.login using the keypair generated
var client = storj.BridgeClient(api, {keyPair: keypair});

// Bucket containing the file to be removed
var bucketid = 'insertbucketid';
// ID of file to be removed
var fileId = 'insertfileid';

// Key ring to hold key used to interact with uploaded file
var keyring = storj.KeyRing('./', 'keypass');

// Remove file from bucket
client.removeFileFromBucket(bucketid, fileId, function(err) {
  if (err) {
    return console.log('error', err.message);
  }

  console.log('info', 'File was successfully removed from bucket.');

  // Delete key used to interact with the file from your keyring
  keyring.del(fileId);
});
