'use strict';

const scrypt = require('scrypt');
const data = JSON.parse(process.argv[0]);
const challenge = data.challenge;
const target = data.target;
const scryptOpts = { N: Math.pow(2, 10), r: 1, p: 1 };
let nonce = 0;

function mine() {
  scrypt.hash(challenge, scryptOpts, 32, nonce, function(err, result) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    if (result.toString('hex') <= target) {
      console.info(nonce);
      process.exit(0);
    } else {
      mine();
    }
  }
}


