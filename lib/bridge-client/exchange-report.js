'use strict';

var assert = require('assert');

/**
 * Represents a report to a bridge regarding the result of a shard exchange
 * @constructor
 * @param {Object} options
 * @param {String} options.reporterId
 * @param {String} [options.farmerId]
 * @param {String} [options.clientId]
 */
function ExchangeReport(options = {}) {
  /* jshint maxcomplexity: 7 */
  if (!(this instanceof ExchangeReport)) {
    return new ExchangeReport(options);
  }

  assert(options.reporterId, 'Invalid reporterId');

  this._r = {
    dataHash: options.dataHash || null,
    reporterId: options.reporterId,
    farmerId: options.farmerId,
    clientId: options.clientId,
    exchangeStart: options.exchangeStart || null,
    exchangeEnd: options.exchangeEnd || null,
    exchangeResultCode: options.exchangeResultCode || null,
    exchangeResultMessage: options.exchangeResultMessage || null
  };
}

ExchangeReport.SUCCESS = 1000;
ExchangeReport.FAILURE = 1100;

/**
 * Starts recording duration of exchange
 * @param {String} dataHash - The shard hash as reference
 */
ExchangeReport.prototype.begin = function(dataHash) {
  assert(dataHash, 'You must supply a dataHash to begin an exchange report');
  this._r.dataHash = dataHash;
  this._r.exchangeStart = Date.now();
};

/**
 * Ends the recording time a set result code and message
 * @param {Number} resultCode - Exchange result code
 * @param {String} resultMessage - Exchange result message
 */
ExchangeReport.prototype.end = function(resultCode, resultMessage) {
  assert(resultCode, 'You must supply a result code');
  assert(resultMessage, 'You must supply a result message');
  this._r.exchangeEnd = Date.now();
  this._r.exchangeResultCode = resultCode;
  this._r.exchangeResultMessage = resultMessage;
};

/**
 * Returns a plain report object
 * @returns {Object}
 */
ExchangeReport.prototype.toObject = function() {
  return JSON.parse(JSON.stringify(this._r));
};

module.exports = ExchangeReport;
