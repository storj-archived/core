/**
 * @module storj
 * @license AGPL-3.0
 */

'use strict';

/**
 * Returns a new {@link Node}
 * @function
 */
module.exports = function(options) {
  return new module.exports.Node(options);
};

/** {@link Node} */
module.exports.Node = require('./lib/node');

/** {@link Rules} */
module.exports.Rules = require('./lib/rules');

/** {@link Transport} */
module.exports.Transport = require('./lib/transport');

/** {@link Server} */
module.exports.Server = require('./lib/server');

/** {@link Audit} */
module.exports.Audit = require('./lib/audit');

/** {@link Proof} */
module.exports.Proof = require('./lib/proof');

/** {@link Offers} */
module.exports.Offers = require('./lib/offers');

/** {@link Contract} */
module.exports.Contract = require('./lib/contract');

/** {@link module:constants} */
module.exports.constants = require('./lib/constants');

/** {@link module:utils} */
module.exports.utils = require('./lib/utils');

/** {@link module:version} */
module.exports.version = require('./lib/version');
