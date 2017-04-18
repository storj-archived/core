'use strict';

const { Duplex: DuplexStream } = require('stream');


/**
 * Represents the Storj-specific HTTP(S) transport
 */
class StorjTransport extends DuplexStream {

  static get DEFAULTS() {
    return {};
  }

  /**
   * Contructs a Storj transport adapter
   * @constructor
   * @param {object} [options]
   */
  constructor(options) {
    super({ objectMode: true });
  }

  /**
   * Implements the readable interface
   * @private
   */
  _read() {

  }

  /**
   * Implements the writable interface
   * @private
   */
  _write([id, buffer, target], encoding, callback) {

  }

  /**
   * Binds the server to the given address/port
   */
  listen() {
    this.server.listen(...arguments);
  }

}

module.exports = StorjTransport;
