#!/usr/bin/env node

'use strict';

const program = require('commander');


program.description('generate various identity keys');

program.option(
  '--extended [hex_seed]',
  'generate private extended key from random or provided seed'
);

program.option(
  '--ssl [days_valid]',
  'generate self-signed ssl certificate for node'
);

program.option(
  '--convert <hex_secp256k1>',
  'generate a private extended key from a regular private key'
);

program.parse(process.argv);

function generateExtended() {
  console.log('extended');
}

function convertToExtended() {
  console.log('convert');
}

function generateSSL() {
  console.log('ssl');
}

if (program.ssl) {
  generateSSL();
} else if (program.convert) {
  convertToExtended();
} else {
  generateExtended();
}
