'use strict';

var Contact = require('../network/contact');
var Contract = require('./index');
var ReadableStream = require('readable-stream');
var inherits = require('util').inherits;
var assert = require('assert');
var merge = require('merge');

/**
 * Manages a stream of offers for a given storage contract publication
 * @constructor
 * @param {Contract} contract - Storage contract published to network
 * @param {Object} [options]
 * @param {Number} [options.maxOffers] - Maximum number of offers to process
 * @param {Array.<String>} [options.farmerBlacklist] - Reject offers from nodeID
 */
function OfferStream(contract, options) {
  if (!(this instanceof OfferStream)) {
    return new OfferStream(contract, options);
  }

  ReadableStream.call(this, { objectMode: true });
  assert(contract instanceof Contract, 'Invalid contract supplied');

  this.options = merge(Object.create(OfferStream.DEFAULTS), options);

  this._contract = contract;
  this._queue = [];
  this._offersQueued = 0;
  this._offersProccessed = 0;
  this._farmersDidOffer = [];
  this._isDestroyed = false;
}

inherits(OfferStream, ReadableStream);

OfferStream.DEFAULTS = {
  maxOffers: 12,
  farmerBlacklist: [],
};

/**
 * Triggered when an offer is received
 * @event OfferStream#data
 * @param {Object} data
 * @param {Contact} data.contact - The sending farmer for the offer
 * @param {Contract} data.contract - The received offer contract
 */

/**
 * Triggered when the maximum number of offers are received and processed
 * @event OfferStream#end
 */

/**
 * Triggered if an error occurs
 * @event OfferStream#error
 * @param {Error} error - The error object with message
 */

/**
 * Implements the underlying stream
 * @private
 */
OfferStream.prototype._read = function() {
  var self = this;

  if (this._offersProccessed === this.options.maxOffers) {
    return this.push(null);
  }

  function _push() {
    self._offersProccessed++;
    self.push(self._queue.shift());
  }

  if (this._queue.length > 0) {
    return setImmediate(_push);
  }

  this.once('_offerAddedToQueue', _push);
};

/**
 * Adds the offer to the internal queue if there is room
 * @param {Contact} contact - The sending farmer for the offer
 * @param {Contract} contract - The received offer contract
 * @returns {Boolean} didAddOfferToQueue
 */
OfferStream.prototype.addOfferToQueue = function(contact, contract) {
  assert(contact instanceof Contact, 'Invalid contact supplied');
  assert(contract instanceof Contract, 'Invalid contract supplied');

  var isDestroyed = this._isDestroyed;
  var farmerSentOffer = this._farmersDidOffer.indexOf(
    contact.nodeID
  ) !== -1;
  var contractIncomplete = !contract.isComplete();
  var maxReached = this._offersQueued === this.options.maxOffers;

  if (isDestroyed || farmerSentOffer || contractIncomplete || maxReached) {
    return false;
  }

  this._farmersDidOffer.push(contact.nodeID);
  this._queue.push({ contact: contact, contract: contract });
  this._offersQueued++;
  this.emit('_offerAddedToQueue');

  return true;
};

/**
 * Tears down listeners and ends the stream
 */
OfferStream.prototype.destroy = function() {
  this._queue = [];
  this._isDestroyed = true;

  setImmediate(this.removeAllListeners.bind(this));
  this.emit('destroy');
};

module.exports = OfferStream;
