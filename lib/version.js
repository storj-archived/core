'use strict';

var semver = require('semver');
var assert = require('assert');

module.exports = (function() {
  var v = require('../package').version;

  if (process.env.STORJ_NETWORK !== "undefined") {
    v += '-' + process.env.STORJ_NETWORK
  }

  assert(semver.valid(v), 'Invalid protocol version specified');

  return v;
})();
