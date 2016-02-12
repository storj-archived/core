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

/**
 * Handles OFFER messages
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype.OFFER = function(params, contact, callback) {
  callback();
};

/**
 * Handles AUDIT messages
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype.AUDIT = function(params, contact, callback) {
  callback();
};

/**
 * Handles CONSIGN messages
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype.CONSIGN = function(params, contact, callback) {
  callback();
};

/**
 * Handles RETRIEVE messages
 * @param {Object} params
 * @param {AddressPortContact} contact
 * @param {Function} callback
 */
Protocol.prototype.RETRIEVE = function(params, contact, callback) {
  callback();
};

module.exports = Protocol;
