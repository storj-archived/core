/**
 * @module storj/deps
 */

'use strict';

/** @see http://kadtools.github.io/ */
exports.kad = require('kad');
/** @see https://github.com/kadtools/kad-quasar */
exports.quasar = require('kad-quasar');
/** @see https://bitcore.io/ */
exports.bitcore = require('bitcore-lib'); require('bitcore-message');
/** @see https://bitcore.io/api/ecies/ */
exports.bitcore.ECIES = require('bitcore-ecies');
