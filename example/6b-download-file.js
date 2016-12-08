'use strict';

var storj = require('storj-lib');
var through = require('through');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// console.login using the keypair generated
var client = storj.BridgeClient(api, {keyPair: keypair});
// Key ring to hold key used to interact with uploaded file
var keyring = storj.KeyRing('./', 'keypass');


// Bucket being download from
var bucket = 'insertbucketid';
// File to be uploaded
var filepath = '/path/to./file.txt';
// Id of file to be downloaded
var id = 'insertfileid';

// Where the downloaded file will be saved
var target = fs.createWriteStream(filepath);

//
var secret = keyring.get(id);

// Prepare to decrypt the encrypted file
var decrypter = new storj.DecryptStream(secret);
var received = 0;
// list of servers to exclude when finding the download server
var exclude = [];

// Handle Events emitted from file download stream
target.on('finish', function() {
  console.log('info', 'File downloaded and written to %s.', [filepath]);
}).on('error', function(err) {
  console.log('error', err.message);
});

// Download the file
client.createFileStream(bucket, id, {
  exclude: exclude
},function(err, stream) {
  if (err) {
    return console.log('error', err.message);
  }

  stream.on('error', function(err) {
    console.log('warn', 'Failed to download shard, reason: %s', [err.message]);
    fs.unlink(filepath, function(unlinkFailed) {
      if (unlinkFailed) {
        return console.log('error', 'Failed to unlink partial file.');
      }

      if (!err.pointer) {
        return;
      }

    });
  }).pipe(through(function(chunk) {
    received += chunk.length;
    console.log('info', 'Received %s of %s bytes', [received, stream._length]);
    this.queue(chunk);
  })).pipe(decrypter).pipe(target);
});
