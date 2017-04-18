/**
 * @module storj/deps
 */

'use strict';

/**
 * Kademlia inspired local file store based on LevelDB
 * @see http://bookch.in/kfs
 */
exports.kfs = require('kfs');

/**
 * Implementation of the Kademlia distributed hash table
 * @see http://kadtools.github.io/
 */
exports.kad = require('kad');
exports.kad.Quasar = require('kad-quasar');

/**
 * A modular node for Bitcoin and blockchain-based apps
 * @see https://bitcore.io/
 */
exports.bitcore = require('bitcore-lib');
exports.bitcore.ECIES = require('bitcore-ecies');
