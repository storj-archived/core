'use strict';

const scrypt = require('scrypt');
const data = JSON.parse(process.argv[2]);
const challenge = data.challenge;
const target = data.target;
const scryptOpts = { N: Math.pow(2, 10), r: 1, p: 1 };
let nonce = 0;

function mine() {
  let salt = Buffer.alloc(8, 0);
  salt.writeDoubleBE(nonce);
  scrypt.hash(challenge, scryptOpts, 32, salt, function(err, result) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    if (result.toString('hex') <= target) {
      console.info(nonce);
      process.exit(0);
    } else {
      nonce += 1;
      mine();
    }
  })
}

mine();
