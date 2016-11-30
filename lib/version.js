/**
 * @module storj/version
 */

'use strict';

var semver = require('semver');
var assert = require('assert');
var postfix = process.env.STORJ_NETWORK ? '-' + process.env.STORJ_NETWORK : '';

module.exports = {
  /** @constant {String} protocol - The supported protocol version */
  protocol: '1.0.0' + postfix,
  /** @constant {String} software - The current software version */
  software: require('../package').version
};

assert(
  semver.valid(module.exports.protocol),
  'Invalid protocol version specified'
);
