'use strict';

var semver = require('semver');
var assert = require('assert');

module.exports = (function() {
  var v = process.env.STORJ_PROTOCOL || require('../package').version;

  assert(semver.valid(v), 'Invalid protocol version specified');
  
  return v;
})();
