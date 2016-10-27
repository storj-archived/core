'use strict';

var OfferStream = require('./offer-stream');
var assert = require('assert');

/**
 * Simple management of a collection of {@link OfferStream}s that are keyable
 * by their associated {@link Contract}'s data hash
 * @constructor
 */
function OfferManager() {
  if (!(this instanceof OfferManager)) {
    return new OfferManager();
  }

  this._offerStreams = {};
}

/**
 * Returns the stream at the given key
 * @param {String} dataHash - The hash of the contract's data
 * @returns {OfferStream|null}
 */
OfferManager.prototype.getStream = function(dataHash) {
  return this._offerStreams[dataHash] || null;
};

/**
 * Removes the stream at the given key
 * @param {String} dataHash - The hash of the contract's data
 */
OfferManager.prototype.removeStream = function(dataHash) {
  delete this._offerStreams[dataHash];
};

/**
 * Adds the offer stream to the manager
 * @param {OfferStream} offerStream - The {@link OfferStream} to manage
 */
OfferManager.prototype.addStream = function(offerStream) {
  assert(offerStream instanceof OfferStream, 'Invalid offer stream supplied');

  var key = offerStream._contract.get('data_hash');
  this._offerStreams[key] = offerStream;

  offerStream.on('end', this.removeStream.bind(this, key));
  offerStream.on('error', this.removeStream.bind(this, key));
  offerStream.on('destroy', this.removeStream.bind(this, key));
};

module.exports = OfferManager;
