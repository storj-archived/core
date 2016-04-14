'use strict';

var merge = require('merge');
var assert = require('assert');
var storj = require('../..');
var portastic = require('portastic');
var JSONLogger = require('kad-logger-json');
var TelemetryReporter = require('../extensions/telemetry');

/**
 * Called after initializing a farmer instance
 * @callback FarmerFactory~createCallback
 * @param {Error|null} err - Error during farmer initialization, if any
 * @param {Object} farmer
 * @param {Object} farmer.node
 * @param {Object} farmer.logger
 * @param {TelemetryReporter|null} farmer.reporter
 */

/**
 * Creates and a new farmer factory
 * @constructor
 */
function FarmerFactory(config, callback) {
  if (!(this instanceof FarmerFactory)) {
    return new FarmerFactory(config, callback);
  }
}

FarmerFactory.PORT_RANGE = { min: 49152, max: 65535 };

FarmerFactory.DEFAULTS = {
  key: null,
  address: null,
  storage: {
    path: '/tmp/storj-farmer',
    size: 5,
    unit: 'MB'
  },
  network: {
    address: '127.0.0.1',
    port: 0,
    seeds: [
      'storj://api.metadisk.org:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052'
    ],
    opcodes: ['0f01020202', '0f02020202', '0f03020202'],
    version: storj.version,
    forward: true
  },
  telemetry: {
    service: 'https://status.storj.io',
    enabled: false
  }
};

/**
 * Creates and initializes a new farmer
 * @param {Object}  config
 * @param {String}  config.key - ECDSA private key for farmer node
 * @param {String}  config.address - BTC payment address
 * @param {Object}  config.storage
 * @param {String}  config.storage.path - File system path to store data
 * @param {Number}  config.storage.size - Storage size to allocate
 * @param {String}  config.storage.unit - Storage size unit (MB|GB|TB)
 * @param {Object}  config.network
 * @param {String}  config.network.address - Optional network address to bind to
 * @param {Array}   config.network.seeds   - Optional Storj URIs to connect to
 * @param {Array}   config.network.opcodes - Optional contract opcodes to farm
 * @param {Array}   config.network.version - Optional protocol version override
 * @param {Boolean} config.network.forward - Try NAT traversal strategies
 * @param {FarmerFactory~createCallback} callback
 */
FarmerFactory.prototype.create = function(config, callback) {
  assert.ok(config, 'No configuration was supplied');

  var farmerconf = merge.recursive(
    Object.create(FarmerFactory.DEFAULTS),
    config
  );

  assert.ok(farmerconf.storage, 'No storage configuration supplied');
  assert.ok(farmerconf.storage.path, 'Storage path does not exist');
  assert.ok(farmerconf.storage.size, 'No storage size supplied');

  var keypair = storj.KeyPair(farmerconf.key);
  var store = storj.FSStorageAdapter(farmerconf.storage.path);
  var manager = storj.Manager(store);
  var reporter = null;

  if (farmerconf.network.version !== storj.version) {
    storj.version = farmerconf.network.version;
  }

  if (farmerconf.telemetry.enabled) {
    assert.ok(farmerconf.address, 'No payout address supplied for telemetry');
    reporter = new TelemetryReporter(farmerconf.telemetry.service, keypair);
  }

  function setup(ports) {
    var logger = new JSONLogger();
    var farmer = storj.Network({
      keypair: keypair,
      manager: manager,
      contact: {
        address: farmerconf.network.address,
        port: ports.pop()
      },
      seeds: farmerconf.network.seeds,
      logger: logger,
      datadir: farmerconf.storage.path,
      opcodes: farmerconf.network.opcodes,
      noforward: !farmerconf.network.forward
    });

    callback(null, {
      node: farmer,
      logger: logger,
      reporter: reporter
    });
  }

  if (farmerconf.network.port === 0) {
    portastic.find(FarmerFactory.PORT_RANGE).then(setup, callback);
  } else {
    setup([farmerconf.network.port]);
  }
};

module.exports = FarmerFactory;
