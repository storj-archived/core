#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');
var program = require('commander');
var storj = require('..');
var platform = require('os').platform();

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USER_PROFILE;
var DEFAULTS = {
  verbosity: 3,
  datadir: path.join(HOME, '.storjnode'),
  seed: 'storj://metadisk.org:4000/b38857ca47b42c624bc74bc7f9b83752d459899b',
  address: '127.0.0.1',
  port: 4000,
  farmer: false
};

program
  .version(storj.version)
  .option('-l, --verbosity [level]', 'Set logger verbosity', DEFAULTS.verbosity)
  .option('-d, --datadir [path]', 'Set path to store data', DEFAULTS.datadir)
  .option('-s, --seed [uri]', 'Connect to seed', DEFAULTS.seed)
  .option('-a, --address [address]', 'Listen on address', DEFAULTS.address)
  .option('-p, --port [port]', 'Listen on port', DEFAULTS.port)
  .option('-k, --key [privkey]', 'Specify a private key', DEFAULTS.key)
  .option('-f, --farmer', 'Accept storage contracts')
  .parse(process.argv);

if (!fs.existsSync(program.datadir)) {
  fs.mkdirSync(program.datadir);
}

var network = storj.Network(storj.KeyPair(program.key), {
  loglevel: program.verbosity,
  seeds: [program.seed],
  datadir: program.datadir,
  contact: {
    address: program.address,
    port: Number(program.port),
  },
  farmer: program.farmer
});

network.join(function(err) {
  if (err) {
    console.log(err);
    process.exit();
  }
});
