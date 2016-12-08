'use strict';

var storj = require('storj-lib');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';
// Create client for interacting with API

// API credentials
var user = {email: 'example@storj.io', password: 'examplePass'};
var client = storj.BridgeClient(api, {basicAuth: user});

// Generate KeyPair
var keypair = storj.KeyPair();

// Add the keypair public key to the user account for authentication
client.addPublicKey(keypair.getPublicKey(), function(err) {
  if (err) {
    // Handle error on failure.
    return console.log('error', err.message);
  }
  // Save the private key for using to login later.
  // You should probably encrypt this
  fs.writeFileSync('./private.key', keypair.getPrivateKey());
});
