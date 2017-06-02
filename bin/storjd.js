#!/usr/bin/env node

'use strict';

const async = require('async');
const program = require('commander');
const assert = require('assert');
const bytes = require('bytes');
const hdkey = require('hdkey');
const hibernate = require('kad-hibernate');
const traverse = require('kad-traverse');
const spartacus = require('kad-spartacus');
const ms = require('ms');
const kfs = require('kfs');
const bunyan = require('bunyan');
const levelup = require('levelup');
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs');
const manifest = require('../package');
const storj = require('..');
const options = require('./_config');
const { execFileSync } = require('child_process');
const { Transform } = require('stream');
const config = require('rc')('storjd', options);


program.version(`
  storjd    1.0.0
  core      ${storj.version.software}
  protocol  ${storj.version.protocol}
`);

program.description(`
  Copyright (c) 2017 Storj Labs, Inc
  Licensed under the GNU Affero General Public License Version 3
`);

program.option('--config <file>', 'path to a storjd configuration file');
program.parse(process.argv);

function storjutil() {
  return execFileSync(
    path.join(__dirname, 'storjutil.js'),
    [...arguments]
  ).toString().trim();
}

// Generate a private extended key if it does not exist
if (!fs.existsSync(config.PrivateExtendedKeyPath)) {
  fs.writeFileSync(
    config.PrivateExtendedKeyPath,
    storjutil('generate-key', '--extended')
  );
}

// Generate self-signed ssl certificate if it does not exist
if (!fs.existsSync(config.TransportServiceKeyPath)) {
  let [key, cert] = storjutil('generate-cert').split('\r\n\r\n');
  fs.writeFileSync(config.TransportServiceKeyPath, key);
  fs.writeFileSync(config.TransportCertificatePath, cert);
}

// Initialize private extended key
const xprivkey = fs.readFileSync(config.PrivateExtendedKeyPath).toString();
const parentkey = hdkey.fromExtendedKey(xprivkey);
const childkey = parentkey.deriveChild(parseInt(config.ChildDerivationIndex));

// Initialize the contract storage database
const contracts = levelup(
  path.join(config.ContractStorageBaseDir, 'contracts.db'),
  { valueEncoding: 'json' }
);

// Initialize the shard storage database
const shards = kfs(path.join(config.ShardStorageBaseDir, 'shards'), {
  sBucketOpts: {
    maxOpenFiles: parseInt(config.ShardStorageMaxOpenFiles)
  },
  maxTableSize: bytes.parse(config.ShardStorageMaxAllocation)
});

// Initialize the directory storage database
const storage = levelup(
  path.join(config.DirectoryStorageBaseDir, 'directory.db'),
  { valueEncoding: 'json' }
);

// Initialize logging
const logger = bunyan.createLogger({
  name: spartacus.utils.toPublicKeyHash(childkey.publicKey).toString('hex')
});

// Initialize transport adapter with SSL
const transport = new storj.Transport({
  key: fs.readFileSync(config.TransportServiceKeyPath),
  cert: fs.readFileSync(config.TransportCertificatePath)
});

// Initialize public contact data
const contact = {
  protocol: 'https:',
  hostname: config.PublicHostname,
  port: parseInt(config.PublicPort),
  xpub: parentkey.publicExtendedKey,
  index: parseInt(config.ChildDerivationIndex),
  agent: `storjd-${manifest.version}/core-${storj.version.software}`
};

// Initialize network seed contacts
const seeds = [];

for (let identity in config.NetworkBootstrapNodes) {
  let { protocol, hostname, port } = url.parse(
    config.NetworkBootstrapNodes[identity]
  );

  seeds.push([identity, { hostname, protocol, port }]);
}

// Initialize protocol implementation
const node = new storj.Node({
  contracts,
  shards,
  storage,
  logger,
  transport,
  contact,
  claims: !!parseInt(config.AllowDirectStorageClaims),
  privateExtendedKey: xprivkey,
  keyDerivationIndex: parseInt(config.ChildDerivationIndex)
});

// Plugin bandwidth metering if enabled
if (!!parseInt(config.BandwidthAccountingEnabled)) {
  node.plugin(hibernate({
    limit: config.BandwidthAccountingMax,
    interval: config.BandwidthAccountingReset,
    reject: ['CLAIM', 'FIND_VALUE', 'STORE', 'CONSIGN']
  }));
}

// Plugin NAT traversal if enabled
if (!!parseInt(config.NatTraversalEnabled)) {
  node.plugin(traverse([
    new traverse.UPNPStrategy({
      publicPort: parseInt(config.PublicPort)
    }),
    new traverse.NATPMPStrategy({
      publicPort: parseInt(config.PublicPort)
    })
  ]));
}

// Use verbose logging if enabled
if (!!parseInt(config.VerboseLoggingEnabled)) {
  node.rpc.deserializer.append(new Transform({
    transform: (data, enc, callback) => {
      let [rpc, ident] = data;

      if (rpc.method) {
        logger.info(
          `received ${rpc.method} (${rpc.id}) from ${ident.params[0]} ` +
          `(https://${ident.params[1].hostname}:${ident.params[1].port})`
        );
      } else {
        logger.info(
          `received response from ${ident.params[0]} to ${rpc.id}`
        );
      }
    }
  }));
  node.rpc.serializer.prepend(new Transform({
    transform: (data, enc, callback) => {
      let [rpc, sender, recv] = data;

      if (rpc.method) {
        logger.info(
          `sending ${rpc.method} (${rpc.id}) to ${recv[0]} ` +
          `(https://${recv[1].hostname}:${recv[1].port})`
        );
      } else {
        logger.info(
          `sending response to ${recv[0]} for ${rpc.id}`
        );
      }
    }
  }));
}

// Bind to listening port and join the network
node.listen(parseInt(config.ListenPort), () => {
  logger.info(`node listening on port ${config.ListenPort}`);
  logger.info(`joining network from ${seeds.length} bootstrap nodes`);
  async.detectSeries(seeds, (contact, done) => {
    node.join(contact, (err) => done(null, !!err));
  }, (err, result) => {
    if (!result) {
      logger.error('failed to join network');
    } else {
      logger.info(
        `connected to network via ${result[0]} ` +
        `(https://${result[1].hostname}:${result[1].port}})`
      );
    }
  });
});

// Establish control server and wrap node instance
// TODO
