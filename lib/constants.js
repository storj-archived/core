/**
 * @module storj/constants
 */

'use strict';

module.exports = {
  /** @constant {String} CIPHER_ALG - Cipher/Decipher algorithm */
  CIPHER_ALG: 'aes-256-cbc',
  /** @constant {Number} PREFIX - NodeID prefix (same as bitcoin) */
  PREFIX: 0x00,
  /** @constant {Number} NONCE_EXPIRE - Time to honor a signed message */
  NONCE_EXPIRE: 10000,
  /** @constant {Number} AUDIT_BYTES - Number of bytes for audit challenge */
  AUDIT_BYTES: 32,
  /** @constant {Number} CLEAN_INTERVAL - Interval for reaping stale shards */
  CLEAN_INTERVAL: 3600000,
  /** @constant {Number} TUNNEL_ANNOUNCE_INTERVAL - Announce tunnel state */
  TUNNEL_ANNOUNCE_INTERVAL: 900000,
  /** @constant {Number} OPCODE_TUNRPC_PREFIX - Opcode for tunnel rpc message */
  OPCODE_TUNRPC_PREFIX: 0x0c,
  /** @constant {Number} OPCODE_TUNDCX_PREFIX - Opcode for tunnel datachannel */
  OPCODE_TUNDCX_PREFIX: 0x0d,
  /** @constant {Number} OPCODE_TUNNELER_PREFIX - Prefix opcode for tunneler */
  OPCODE_TUNNELER_PREFIX: 0x0e,
  /** @constant {Number} OPCODE_CONTRACT_PREFIX - Prefix opcode for contracts */
  OPCODE_CONTRACT_PREFIX: 0x0f,
  /** @constant {Number} OPCODE_DEG_NULL - Opcode for null criteria degree */
  OPCODE_DEG_NULL: 0x00,
  /** @constant {Number} OPCODE_DEG_LOW - Opcode for low criteria degree */
  OPCODE_DEG_LOW: 0x01,
  /** @constant {Number} OPCODE_DEG_MED - Opcode for medium criteria degree */
  OPCODE_DEG_MED: 0x02,
  /** @constant {Number} OPCODE_DEG_HIGH - Opcode for medium criteria degree */
  OPCODE_DEG_HIGH: 0x03
};
