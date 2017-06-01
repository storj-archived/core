#!/usr/bin/env node

'use strict';

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
const program = require('commander');
const storj = require('..');
const options = require('./storjd-config');
const config = require('rc')('storj', options);

/* ========================================================================= */

program.version(`
  storjd    ${manifest.version}
  core      ${storj.version.software}
  protocol  ${storj.version.protocol}
`);

program.description(
  'run a storj node and control it from any application'
);

program.option(
  '--config <file>',
  'storjd configuration file'
);

program.option(
  '--list-config-options',
  'print all valid storjd configuration properties'
);

program.option(
  '--generate-key [hex_seed]',
  'generate a new private extended key (from optional seed) and exit'
);

program.option(
  '--convert-key <hex_secp265k1_key>',
  'generate a private extended key from existing private key and exit'
);

program.parse(process.argv);

/* ========================================================================= */

// Generate a new private extended key and exit if option supplied
if (program.generateKey) {
  try {
    if (typeof program.generateKey !== 'string') {
      program.generateKey = undefined;
    } else {
      program.generateKey = Buffer.from(program.generateKey, 'hex');
    }
    console.log(
      spartacus.utils.toHDKeyFromSeed(program.generateKey).privateExtendedKey
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}

/* ========================================================================= */

// Convert a private key to extended key and exit if option supplied
if (program.convertKey) {
  try {
    console.log(
      spartacus.utils.toExtendedFromPrivateKey(
        Buffer.from(program.convertKey, 'hex')
      )
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}
/* ========================================================================= */

if (program.listConfigOptions) {
  for (let prop in options) {
    if (!['_', 'list-config-options'].includes(prop)) {
      console.log(prop);
    }
  }
  process.exit(0);
}

/* ========================================================================= */

if (!program.config) {
  program.optionMissingArgument({ flags: '--config' });
  process.exit(1);
}

// TODO: Check for x_private_key, service_key.pem, certificate.pem
// TODO: and create them if they do not exist

function start() {
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
  const shards = kfs(config.ShardStorageBaseDir, {
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
    name: spartacus.utils.toPublicKeyHash(childkey.publicKey)
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
    async.detectSeries(seeds, (contact, done) => {
      node.join(contact, (err) => done(null, !!err));
    }, (err, result) => {
      if (!result) {
        logger.error('failed to join network, exiting');
        process.exit(1);
      }

      logger.info(
        `connected to network via ${result[0]} ` +
        `(https://${result[1].hostname}:${result[1].port}})`
      );

      // TODO: Bind RPC Control Port
    });
  });
}
