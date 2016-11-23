'use strict';

var storj = require('storj-lib');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// How many pieces of the file can be uploaded at once
var concurrency = 6;

// console.login using the keypair generated
var client = storj.BridgeClient(api, {
  keyPair: keypair,
  concurrency: concurrency // Set upload concurrency
});

// Bucket being uploaded to
var bucket = 'insertbucketid';
// File to be uploaded
var filepath = '/path/to./file.txt';
// Path to temporarily store encrypted version of file to be uploaded
var tmppath = './' + filepath + '.crypt';
// Key ring to hold key used to interact with uploaded file
var keyring = storj.KeyRing('./', 'keypass');

// Prepare to encrypt file for upload
var secret = new storj.DataCipherKeyIv();
var encrypter = new storj.EncryptStream(secret);

//Encrypt the file to be uploaded and store it temporarily
fs.createReadStream(filepath)
  .pipe(encrypter)
  .pipe(fs.createWriteStream(tmppath)).on('finish', function() {

  // Create token for uploading to bucket by bucketid
  client.createToken(bucket, 'PUSH', function(err, token) {
    if (err) {
      console.log('error', err.message);
    }

    // Store the file using the bucket id, token, and encrypted file
    client.storeFileInBucket(bucket, token.token,tmppath, function(err, file) {
      if (err) {
        return console.log('error', err.message);
      }

      // Save key for access to download file
      keyring.set(file.id, secret);

      console.log(
        'info',
        'Name: %s, Type: %s, Size: %s bytes, ID: %s',
        [file.filename, file.mimetype, file.size, file.id]
      );
    });
  });
});
