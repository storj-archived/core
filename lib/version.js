'use strict';

var semver = require('semver');
var assert = require('assert');
var postfix = process.env.STORJ_NETWORK ? '-' + process.env.STORJ_NETWORK : '';

module.exports = {
  protocol: '0.8.0' + postfix,
  software: require('../package').version
};

assert(
  semver.valid(module.exports.protocol),
  'Invalid protocol version specified'
);
