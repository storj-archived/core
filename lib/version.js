'use strict';

var semver = require('semver');
var assert = require('assert');

module.exports = {
  protocol: process.env.STORJ_PROTOCOL || '0.7.0',
  software: require('../package').version
};

assert(
  semver.valid(module.exports.protocol),
  'Invalid protocol version specified'
);
