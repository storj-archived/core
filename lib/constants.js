/**
 * @module storj/constants
 * @license LGPL-3.0
 */

'use strict';

module.exports = {
  /** @constant {String} CIPHER_ALG - Cipher/Decipher algorithm */
  CIPHER_ALG: 'aes-256-ctr',
  /** @constant {Number} PREFIX - NodeID prefix (same as bitcoin) */
  PREFIX: 0x00,
  /** @constant {Number} NONCE_EXPIRE - Time to honor a signed message */
  NONCE_EXPIRE: 15000,
  /** @constant {Number} RPC_TIMEOUT - Max wait time for a RPC response */
  RPC_TIMEOUT: 15000,
  /** @constant {Number} PUBLISH_TTL - Max time for publication relay */
  PUBLISH_TTL: 6,
  /** @constant {Number} NET_REENTRY - Max wait time before re-entering net */
  NET_REENTRY: 600000,
  /** @constant {Number} AUDIT_BYTES - Number of bytes for audit challenge */
  AUDIT_BYTES: 32,
  /** @constant {Number} CLEAN_INTERVAL - Interval for reaping stale shards */
  CLEAN_INTERVAL: 10800000,
  /** @constant {Number} CONSIGN_THRESHOLD - Threshold for consign time */
  CONSIGN_THRESHOLD: 86400000,
  /** @constant {Number} TOKEN_EXPIRE - Reject datachannl token after time */
  TOKEN_EXPIRE: 1800000,
  /** @constant {Number} TUNNEL_ANNOUNCE_INTERVAL - Announce tunnel state */
  TUNNEL_ANNOUNCE_INTERVAL: 900000,
  /** @constant {Number} OFFER_TIMEOUT - Max wait time for storage offer */
  OFFER_TIMEOUT: 15000,
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
  /** @constant MAX_NODE_INDEX - Maximum node index */
  MAX_NODE_INDEX: 0x7fffffff,
  /** @constant HD_KEY_DERIVATION_PATH - Key derivation path for HD keys */
  HD_KEY_DERIVATION_PATH: 'm/3000\'/0\''
};
