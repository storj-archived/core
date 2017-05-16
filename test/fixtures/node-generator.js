'use strict';

const { tmpdir } = require('os');
const { randomBytes } = require('crypto');
const async = require('async');
const pem = require('pem');
const path = require('path');
const kfs = require('kfs');
const bunyan = require('bunyan');
const levelup = require('levelup');
const memdown = require('memdown');
const storj = require('../..');

let startPort = 45000;


module.exports = function(numNodes, callback) {

  const nodes = [];

  function createNode(callback) {
    const kfsPath = path.join(
      tmpdir(),
      `storj-lib.integration-${randomBytes(6).toString('hex')}`
    );
    const logger = bunyan.createLogger({
      levels: ['fatal'],
      name: 'node-kademlia'
    });
    const storage = levelup('node-kademlia', { db: memdown });
    const contracts = levelup('node-storj', { db: memdown });
    const contact = {
      hostname: 'localhost',
      port: startPort++,
      protocol: 'https:'
    };
    const shards = kfs(kfsPath, { sBucketOpts: { maxOpenFiles: 50 } });

    pem.createCertificate({ days: 1, selfSigned: true }, function(err, keys) {
      const transport = new storj.Transport({
        key: keys.serviceKey,
        cert: keys.certificate
      });

      callback(storj({
        contact,
        contracts,
        storage,
        shards,
        logger,
        transport
      }));
    });
  }

  async.times(numNodes, function(n, done) {
    createNode((node) => {
      nodes.push(node);
      done();
    });
  }, () => callback(nodes));
};
