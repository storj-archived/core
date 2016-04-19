'use strict';

var stream = require('readable-stream');
var assert = require('assert');
var inherits = require('util').inherits;
var constants = require('../constants');
var TunnelGateway = require('./gateway');

/**
 * Multiplexes events from a {@link TunnelGateway} and exposes a readable
 * stream to piped down to a {@link TunnelClient}.
 * @constructor
 * @param {TunnelGateway} gateway - Tunnel gateway object to multiplex
 */
function TunnelMuxer(gateway) {
  if (!(this instanceof TunnelMuxer)) {
    return new TunnelMuxer(gateway);
  }

  assert(gateway instanceof TunnelGateway, 'Invalid gateway object supplied');
  this._bindGateway(gateway);
  stream.Readable.call(this);
}

inherits(TunnelMuxer, stream.Readable);

/**
 * Set up event listeners on internal gateway object
 * @private
 * @param {TunnelGateway} gateway - Tunnel gateway to bind
 * @returns {TunnelGateway} gateway
 */
TunnelMuxer.prototype._bindGateway = function(gateway) {
  gateway.on('message/rpc', this._muxRPC.bind(this));
  gateway.on('message/datachannel', this._muxDataChannel.bind(this));

  return (this._gateway = gateway);
};

/**
 * Parses and multiplexes RPC messages
 * @private
 * @param {kad.Message} message - The RPC message to mux
 */
TunnelMuxer.prototype._muxRPC = function(message) {
  this.push(Buffer.concat([
    Buffer([constants.OPCODE_TUNRPC_PREFIX]),
    message.serialize()
  ]));
};

/**
 * Parses and multiplexes datachannel messages
 * @private
 * @param {Buffer|String} data - The included data in the datachannel message
 * @param {Object} flags - Metadata about the message
 */
TunnelMuxer.prototype._muxDataChannel = function(data, flags) {
  this.push(Buffer.concat([
    Buffer([constants.OPCODE_TUNDC_PREFIX]),
    Buffer([flags.binary ? 0x02 : 0x01]), // NB: WebSocket opcode for frame type
    Buffer(flags.quid, 'hex'),
    Buffer(data)
  ]));
};

/**
 * Unimplemented _read stub
 * @private
 */
TunnelMuxer.prototype._read = function noop() {};

module.exports = TunnelMuxer;
