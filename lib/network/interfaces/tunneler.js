'use strict';

var Network = require('..');
var inherits = require('util').inherits;
var merge = require('merge');
var StorageManager = require('../../storage/manager');
var RAMStorageAdapter = require('../../storage/adapters/ram');

/**
 * Creates a new tunneler interface (a passive non-renter/non-farmer node) and
 * is just a {@link Network} instance, with more appropriate default options
 * including an in-memory storage adapter.
 * @constructor
 * @license AGPL-3.0
 * @extends {Network}
 * @param {Object}  options
 * @param {KeyPair} options.keypair - Node's cryptographic identity
 * @param {Object}  options.logger - Optional logger override
 * @param {Array}   options.seeds - List of seed URIs to join
 * @param {String}  options.address - Public node IP or hostname
 * @param {Number}  options.port - Listening port for RPC
 * @param {Boolean} options.noforward - Flag for skipping traversal strategies
 * @param {Number}  options.tunnels - Max number of tunnels to provide
 * @param {Number}  options.tunport - Port for tunnel server to use
 * @param {Object}  options.gateways
 * @param {Number}  options.gateways.min - Min port for gateway binding
 * @param {Number}  options.gateways.max - Max port for gateway binding
 */
function TunnelerInterface(options) {
  if (!(this instanceof TunnelerInterface)) {
    return new TunnelerInterface(options);
  }

  options = merge(Object.create(TunnelerInterface.DEFAULTS), options);

  Network.call(this, merge(options, {
    manager: new StorageManager(new RAMStorageAdapter())
  }));
}

inherits(TunnelerInterface, Network);

TunnelerInterface.DEFAULTS = merge(Object.create(Network.DEFAULTS), {
  tunnels: 24,
  port: 8080,
  tunport: 8081,
  gatways: { min: 8082, max: 9005 },
  noforward: true // NB: Tunnelers generally should be public already
});

module.exports = TunnelerInterface;
