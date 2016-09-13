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
 * @param {KeyPair} options.keyPair - Node's cryptographic identity
 * @param {String}  options.bridgeUri - URL for bridge server seed lookup
 * @param {Object}  options.logger - Logger instance
 * @param {Array}   options.seedList - List of seed URIs to join
 * @param {String}  options.rpcAddress - Public node IP or hostname
 * @param {Number}  [options.rpcPort=8080] - Listening port for RPC
 * @param {Boolean} [options.doNotTraverseNat=true] - Skip NAT traversal
 * @param {Number}  [options.maxTunnels] - Max number of tunnels to provide
 * @param {Number}  [options.tunnelServerPort=8081] - Port for tunnel server
 * @param {Object}  options.tunnelGatewayRange
 * @param {Number}  [options.tunnelGatewayRange.min=8082] - Min port for bind
 * @param {Number}  [options.tunnelGatewayRange.max=9005] - Max port for bind
 * @param {Object}  options.rateLimiterOpts - Options for {@link RateLimiter}
 */
function TunnelerInterface(options) {
  if (!(this instanceof TunnelerInterface)) {
    return new TunnelerInterface(options);
  }

  options = merge(Object.create(TunnelerInterface.DEFAULTS), options);

  Network.call(this, merge(options, {
    storageManager: new StorageManager(new RAMStorageAdapter())
  }));
}

inherits(TunnelerInterface, Network);

TunnelerInterface.DEFAULTS = merge(Object.create(Network.DEFAULTS), {
  maxTunnels: 24,
  rpcPort: 8080,
  tunnelServerPort: 8081,
  tunnelGatewayRange: { min: 8082, max: 9005 },
  doNotTraverseNat: true // NB: Tunnelers generally should be public already
});

module.exports = TunnelerInterface;
