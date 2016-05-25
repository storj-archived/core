'use strict';

var semver = require('semver');
var assert = require('assert');

module.exports = (function() {
  var v = require('../package').version + "-" + process.env.STORJ_NETWORK || require('../package').version;

  assert(semver.valid(v), 'Invalid protocol version specified');

  return v;
})();
