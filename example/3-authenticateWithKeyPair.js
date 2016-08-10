'use strict';

var storj = require('storj');
var fs = require('fs');
// Set the bridge api URL
var api = 'https://api.storj.io';

// Load keypair from your saved private key
var keypair = storj.KeyPair(fs.readFileSync('./private.key').toString());

// Login using the keypair generated
var client;
client = storj.BridgeClient(api, {keypair: keypair});
