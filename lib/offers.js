'use strict';

const { Readable: ReadableStream } = require('stream');
const merge = require('merge');


/**
 * Manages a stream of offers for a given storage contract publication
 */
class Offers extends ReadableStream {

  static get DEFAULTS() {
    return {
      maxOffers: 12,
      farmerBlacklist: []
    };
  }

  /**
   * @constructor
   * @param {Contract} contract - Storage contract published to network
   * @param {Object} [options]
   * @param {Number} [options.maxOffers] - Maximum number of offers to process
   * @param {Array.<String>} [options.farmerBlacklist] - Reject offers from nodeID
   */
  constructor(contract, options) {
    super({ objectMode: true });

    this.options = merge(Object.create(Offers.DEFAULTS), options);
    this._contract = contract;
    this._queue = [];
    this._offersQueued = 0;
    this._offersProccessed = 0;
    this._farmersDidOffer = [];
    this._isDestroyed = false;
  }

  /**
   * Triggered when an offer is received
   * @event Offers#data
   * @param {Object} data
   * @param {Contact} data.contact - The sending farmer for the offer
   * @param {Contract} data.contract - The received offer contract
   */

  /**
   * Triggered when the maximum number of offers are received and processed
   * @event Offers#end
   */

  /**
   * Triggered if an error occurs
   * @event Offers#error
   * @param {Error} error - The error object with message
   */

  /**
   * Implements the underlying stream
   * @private
   */
  _read() {
    if (this._offersProccessed === this.options.maxOffers) {
      return this.push(null);
    }

    const _push = () => {
      this._offersProccessed++;
      this.push(this._queue.shift());
    }

    if (this._queue.length > 0) {
      return setImmediate(_push);
    }

    this.once('_offerAddedToQueue', _push);
  }

  /**
   * Adds the offer to the internal queue if there is room
   * @param {array} contact - The sending farmer for the offer
   * @param {object} contract - The received offer contract
   * @param {function} callback
   */
  queue(contact, contract, callback) {
    const isDestroyed = this._isDestroyed;
    const farmerSentOffer = this._farmersDidOffer.indexOf(contact[0]) !== -1;
    const contractIncomplete = !contract.isComplete();
    const maxReached = this._offersQueued === this.options.maxOffers;

    if (isDestroyed || farmerSentOffer || contractIncomplete || maxReached) {
      return callback(new Error('Storage offer rejected'));
    }

    this._farmersDidOffer.push(contact[0]);
    this._queue.push({ contact: contact, contract: contract, callback });
    this._offersQueued++;
    this.emit('_offerAddedToQueue');
  }

  /**
   * Tears down listeners and ends the stream
   */
  destroy() {
    this._queue = [];
    this._isDestroyed = true;

    setImmediate(this.removeAllListeners.bind(this));
    this.emit('destroy');
  }

}

module.exports = Offers;
