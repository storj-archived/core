'use strict';

var stream = require('readable-stream');
var kad = require('kad');
var inherits = require('util').inherits;
var constants = require('../constants');

/**
 * Demultiplexes a multiplexed tunnel stream
 * @constructor
 * @fires TunnelDemuxer#data
 * @license AGPL-3.0
 */
function TunnelDemuxer() {
  if (!(this instanceof TunnelDemuxer)) {
    return new TunnelDemuxer();
  }

  stream.Transform.call(this, { objectMode: true });
}

/**
 * @event TunnelDemuxer#data
 * @param {Object} demuxedMessage
 * @param {String} demuxedMessage.type - The message type (rpc, datachannel)
 * @param {Buffer|String} demuxedMessage.data - The message payload
 * @param {Object} demuxedMessage.flags
 * @param {Boolean} demuxedMessage.flags.binary - WebSocket opcode binary flag
 * @param {String} demuxedMessage.flags.quid - Quasi-unique associatation ID
 */

inherits(TunnelDemuxer, stream.Transform);

/**
 * Parses and demultiplexes RPC messages
 * @private
 * @param {Buffer} buffer - The RPC data to demux
 * @param {Function} callback
 */
TunnelDemuxer.prototype._demuxRPC = function(buffer, callback) {
  callback(null, {
    type: 'rpc',
    data: kad.Message.fromBuffer(buffer.slice(1)),
    flags: {}
  });
};

/**
 * Parses and demultiplexes datachannel messages
 * @private
 * @param {Buffer} buffer - The datachannel data to demux
 * @param {Function} callback
 */
TunnelDemuxer.prototype._demuxDataChannel = function(buffer, callback) {
  if ([0x01, 0x02].indexOf(buffer[1]) === -1) {
    return callback(new Error('Invalid frame type opcode supplied'));
  }

  var binary = buffer[1] === 0x02; // NB: WebSocket opcode for frame type
  var data = buffer.slice(8);

  callback(null, {
    type: 'datachannel',
    data: binary ? data : data.toString(),
    flags: {
      binary: binary,
      quid: buffer.slice(2, 8).toString('hex')
    }
  });
};

/**
 * Input transformer
 * @private
 */
TunnelDemuxer.prototype._transform = function(buffer, encoding, callback) {
  switch (buffer[0]) {
    case constants.OPCODE_TUNRPC_PREFIX:
      return this._demuxRPC(buffer, callback);
    case constants.OPCODE_TUNDCX_PREFIX:
      return this._demuxDataChannel(buffer, callback);
    default:
      return callback(new Error('Invalid input for tunnel demuxing'));
  }
};

module.exports = TunnelDemuxer;
