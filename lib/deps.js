/**
 * @module storj/deps
 */

'use strict';

module.exports = (function() {
  var pack = require('../package');
  var deps = {};

  for (var _dep in pack.dependencies) {
    deps[_dep] = require(_dep);
  }

  return deps;
})();
