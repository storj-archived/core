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
  if (!(this instanceof ExchangeReport)) {
    return new ExchangeReport(options);
  }

  assert(options.reporterId, 'Invalid reporterId');

  this._r = {
    reporterId: options.reporterId,
    farmerId: options.farmerId,
    clientId: options.clientId,
    exchangeTime: options.exchangeTime || 0,
    exchangeResultCode: options.exchangeResultCode || 0,
    exchangeResultMessage: options.exchangeResultMessage || ''
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
  this._r.exchangeTime = 0;
  this._timer = setInterval(() => this._r.exchangeTime += 200, 200);
};

/**
 * Ends the recording time a set result code and message
 * @param {Number} resultCode - Exchange result code
 * @param {String} resultMessage - Exchange result message
 */
ExchangeReport.prototype.end = function(resultCode, resultMessage) {
  assert(resultCode, 'You must supply a result code');
  clearInterval(this._timer);
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
