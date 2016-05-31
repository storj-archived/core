'use strict';

var merge = require('merge');
var ms = require('ms');

/**
 * Tracks the number of messages received from a given nodeID and prevents
 * handling of message received during the limited timespan
 * @constructor
 * @param {Object} options
 * @param {Number} options.rate - The number of milliseconds before resetting
 * @param {Number} options.limit - The number of messages allowed per rate
 */
function RateLimiter(options) {
  if (!(this instanceof RateLimiter)) {
    return new RateLimiter(options);
  }

  options = merge(Object.create(RateLimiter.DEFAULTS), options);

  this.rate = options.rate;
  this.limit = options.limit;
  this.started = Date.now();

  this.resetCounter();
  setInterval(this.resetCounter.bind(this), this.rate);
}

RateLimiter.DEFAULTS = {
  rate: ms('1m'),
  limit: 120
};

/**
 * Increment the counter for the given nodeID
 * @param {String} nodeID - The nodeID of the contact to track
 */
RateLimiter.prototype.updateCounter = function(nodeID) {
  this._counter[nodeID] = (this._counter[nodeID] || 0) + 1;
};

/**
 * Checks if the given nodeID is currently rate limited
 * @param {String} nodeID - The nodeID for the contact to check
 * @returns {Boolean}
 */
RateLimiter.prototype.isLimited = function(nodeID) {
  return this._counter[nodeID] ?
         this._counter[nodeID] > this.limit :
         false;
};

/**
 * Resets the rate limit count
 */
RateLimiter.prototype.resetCounter = function() {
  this._counter = {};
};

/**
 * Returns the time left before counter reset
 * @returns {Number}
 */
RateLimiter.prototype.getResetTime = function() {
  return this.rate - ((Date.now() - this.started) % this.rate);
};

module.exports = RateLimiter;
