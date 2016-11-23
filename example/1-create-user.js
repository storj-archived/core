'use strict';

var storj = require('storj-lib');
// Set the bridge api URL
var api = 'https://api.storj.io';
// Create client for interacting with API
var client = storj.BridgeClient(api);

// Create User
client.createUser({
  email: 'example@storj.io',
  password: 'examplePass'
}, function(err) {
  if (err) {
    // Handle error on failure.
    return console.log('error', err.message);
  }

  // Check email for confirmation link
  console.log('user created!');
});
