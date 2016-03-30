/**
 * @module storj/constants
 */

'use strict';

module.exports = {
  /** @constant {Number} PREFIX - NodeID prefix (same as bitcoin) */
  PREFIX: 0x00,
  /** @constant {Number} NONCE_EXPIRE - Time to honor a signed message */
  NONCE_EXPIRE: 10000,
  /** @constant {Number} AUDIT_BYTES - Number of bytes for audit challenge */
  AUDIT_BYTES: 32,
  /** @constant {Number} CLEAN_INTERVAL - Interval for reaping stale shards */
  CLEAN_INTERVAL: 3600000,
  /** @constant {Number} OPCODE_DEG_LOW - Opcode for low criteria degree */
  OPCODE_DEG_LOW: 0x01,
  /** @constant {Number} OPCODE_DEG_MED - Opcode for medium criteria degree */
  OPCODE_DEG_MED: 0x02,
  /** @constant {Number} OPCODE_DEG_HIGH - Opcode for medium criteria degree */
  OPCODE_DEG_HIGH: 0x03
};
