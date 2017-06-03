'use strict';

const ini = require('ini');
const { existsSync, writeFileSync } = require('fs');
const mkdirp = require('mkdirp');
const { homedir } = require('os');
const { join } = require('path');
const datadir = join(homedir(), '.config/storjd');

module.exports = {

  // Identity/Cryptography
  PrivateExtendedKeyPath: join(datadir, 'x_private_key'),
  ChildDerivationIndex: '0',

  // Contract Storage
  ContractStorageBaseDir: datadir,

  // Shard Database
  ShardStorageBaseDir: datadir,
  ShardStorageMaxAllocation: '0GB',
  ShardStorageMaxOpenFiles: '50',

  // Trusted Renter Nodes
  AllowDirectStorageClaims: [],

  // Directory Storage
  DirectoryStorageBaseDir: datadir,

  // Server SSL
  TransportServiceKeyPath: join(datadir, 'service_key.pem'),
  TransportCertificatePath: join(datadir, 'certificate.pem'),

  // Public Addressability
  PublicHostname: '127.0.0.1',
  PublicPort: '4000',
  NatTraversalEnabled: '0',
  ListenPort: '4000',

  // Network Bootstrapping
  NetworkBootstrapNodes: {
    '78652c1229ba21a48c28e8ef73fa06f174b4a596': 'https://seed.bookch.in:8443'
  },

  // Bandwidth Metering
  BandwidthAccountingEnabled: '0',
  BandwidthAccountingMax: '5GB',
  BandwidthAccountingReset: '24HR',

  // Debugging/Developer
  VerboseLoggingEnabled: '1',
  ControlPort: '4001',
  ControlHostname: '127.0.0.1'

};

if (!existsSync(join(datadir, 'config'))) {
  mkdirp.sync(datadir);
  writeFileSync(join(datadir, 'config'), ini.stringify(module.exports));
}
