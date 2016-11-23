'use strict';

var storj = require('storj-lib');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// Login using the keypair generated
var client = storj.BridgeClient(api, {keyPair: keypair});

client.getPublicKeys(function(err, keys) {
  if (err) {
    return console.log('error', err.message);
  }

  // print out each key
  keys.forEach(function(key) {
    console.log('info', key.key);
  });
});
