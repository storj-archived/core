'use strict';

var stream = require('readable-stream');
var inherits = require('util').inherits;
var constants = require('../constants');

/**
 * Multiplexes events from a {@link TunnelGateway} and exposes a readable
 * stream to piped down to a {@link TunnelClient} (and vice-versa).
 * @constructor
 */
function TunnelMuxer() {
  if (!(this instanceof TunnelMuxer)) {
    return new TunnelMuxer();
  }

  stream.Transform.call(this, { objectMode: true });
}

inherits(TunnelMuxer, stream.Transform);

/**
 * Set up event listeners for a {@link TunnelGateway} or {@link TunnelClient}
 * @param {TunnelGateway|TunnelClient} source - Input source to add
 * @returns {TunnelGateway|TunnelClient} source
 */
TunnelMuxer.prototype.source = function(source) {
  var self = this;

  source.on('message/rpc', function(message) {
    self.write({ type: 'rpc', data: message, flags: {} });
  });
  source.on('message/datachannel', function(data, flags) {
    self.write({ type: 'datachannel', data: data, flags: flags });
  });

  return (this._source = source);
};

/**
 * Parses and multiplexes RPC messages
 * @private
 * @param {kad.Message} message - The RPC message to mux
 * @param {Function} callback
 */
TunnelMuxer.prototype._muxRPC = function(message, callback) {
  callback(null, Buffer.concat([
    Buffer([constants.OPCODE_TUNRPC_PREFIX]),
    message.serialize()
  ]));
};

/**
 * Parses and multiplexes datachannel messages
 * @private
 * @param {Buffer|String} data - The included data in the datachannel message
 * @param {Object} flags - Metadata about the message
 * @param {Function} callback
 */
TunnelMuxer.prototype._muxDataChannel = function(data, flags, callback) {
  callback(null, Buffer.concat([
    Buffer([constants.OPCODE_TUNDC_PREFIX]),
    Buffer([flags.binary ? 0x02 : 0x01]), // NB: WebSocket opcode for frame type
    Buffer(flags.quid, 'hex'),
    Buffer(data)
  ]));
};

/**
 * Input transformer
 * @private
 */
TunnelMuxer.prototype._transform = function(object, encoding, callback) {
  switch (object.type) {
    case 'rpc':
      return this._muxRPC(object.data, callback);
    case 'datachannel':
      return this._muxDataChannel(object.data, object.flags, callback);
    default:
      return callback(new Error('Invalid input for tunnel muxing'));
  }
};

module.exports = TunnelMuxer;
