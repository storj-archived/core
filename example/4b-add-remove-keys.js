'use strict';

var storj = require('storj-lib');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// Login using the keypair generated
var client = storj.BridgeClient(api, {keyPair: keypair});

// Generate new keypair to add/delete
keypair = storj.KeyPair();

// Add Public Key
client.addPublicKey(keypair.getPublicKey(), function(err) {
  if (err) {
    // Handle error on failure.
    return console.log('error', err.message);
  }

  // Remove Public Key that was just added
  client.destroyPublicKey(keypair.getPublicKey(), function(err) {
    if (err) {
      // Handle error on failure.
      return console.log('error', err.message);
    }

    console.log('info', 'Key successfully revoked.');
  });
});
