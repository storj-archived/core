/**
 * @module storj/constants
 */

'use strict';

module.exports = {
  /** @constant {String} CIPHER_ALG - Cipher/Decipher algorithm */
  CIPHER_ALG: 'aes-256-ctr',
  /** @constant {Number} PREFIX - NodeID prefix (same as bitcoin) */
  PREFIX: 0x00,
  /** @constant {Number} NONCE_EXPIRE - Time to honor a signed message */
  NONCE_EXPIRE: 30000,
  /** @constant {Number} RPC_TIMEOUT - Max wait time for a RPC response */
  RPC_TIMEOUT: 30000,
  /** @constant {Number} AUDIT_BYTES - Number of bytes for audit challenge */
  AUDIT_BYTES: 32,
  /** @constant {Number} CLEAN_INTERVAL - Interval for reaping stale shards */
  CLEAN_INTERVAL: 10800000,
  /** @constant {Number} TUNNEL_ANNOUNCE_INTERVAL - Announce tunnel state */
  TUNNEL_ANNOUNCE_INTERVAL: 900000,
  /** @constant {Number} ROUTER_CLEAN_INTERVAL - Drop bad contacts */
  ROUTER_CLEAN_INTERVAL: 60000,
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
  OPCODE_DEG_HIGH: 0x03,
  /** @constant {Number} MAX_CONCURRENT_OFFERS - Number of concurrent offers */
  MAX_CONCURRENT_OFFERS: 3,
  /** @constant {Number} MAX_CONCURRENT_AUDITS - Number of concurrent audits */
  MAX_CONCURRENT_AUDITS: 3,
  /** @constant MAX_FIND_TUNNEL_RELAYS - Max times to relay FIND_TUNNEL */
  MAX_FIND_TUNNEL_RELAYS: 2,
  /** @constant {Number} SUBSCRIBE_THROTTLE - Wait between opcode subscribe */
  SUBSCRIBE_THROTTLE: 3000
};
