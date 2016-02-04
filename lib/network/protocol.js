/**
 * @module storj/network/protocol
 */

'use strict';

/**
 * Defines the Storj protocol methods
 * @constructor
 * @param {Network} network
 */
function Protocol(network) {
  if (!(this instanceof Protocol)) {
    return new Protocol(network);
  }
}

module.exports = Protocol;
