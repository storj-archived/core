/**
 * @module storjd/constants
 */

'use strict';

module.exports = {

  /**
   * @constant {Number} AUDIT_BYTES - Number of bytes for audit challenge
   */
  AUDIT_BYTES: 32,

  /**
   * @constant {Number} CLEAN_INTERVAL - Interval for reaping stale shards
   */
  CLEAN_INTERVAL: 86400000,

  /**
   * @constant {Number} CONSIGN_THRESHOLD - Threshold for consign time
   */
  CONSIGN_THRESHOLD: 86400000,

  /**
   * @constant {Number} TOKEN_EXPIRE - Reject datachannl token after time
   */
  TOKEN_EXPIRE: 1800000,

  /**
   * @constant {Number} OFFER_TIMEOUT - Max wait time for storage offer
   */
  OFFER_TIMEOUT: 15000,

  /**
   * @constant {Number} OPCODE_CONTRACT_PREFIX - Prefix opcode for contracts
   */
  OPCODE_CONTRACT_PREFIX: 0x0f,

  /**
   * @constant {Number} OPCODE_DEG_NULL - Opcode for null criteria degree
   */
  OPCODE_DEG_NULL: 0x00,

  /**
   * @constant {Number} OPCODE_DEG_LOW - Opcode for low criteria degree
   */
  OPCODE_DEG_LOW: 0x01,

  /**
   * @constant {Number} OPCODE_DEG_MED - Opcode for medium criteria degree
   */
  OPCODE_DEG_MED: 0x02,

  /**
   * @constant {Number} OPCODE_DEG_HIGH - Opcode for medium criteria degree
   */
  OPCODE_DEG_HIGH: 0x03,

  /**
   * @constant {Number} MAX_CONCURRENT_OFFERS - Number of concurrent offers
   */
  MAX_CONCURRENT_OFFERS: 3,

  /**
   * @constant {Number} MAX_CONCURRENT_AUDITS - Number of concurrent audits
   */
  MAX_CONCURRENT_AUDITS: 3,

  /**
   * @constant MAX_NODE_INDEX - Maximum node index
   */
  MAX_NODE_INDEX: 0x7fffffff,

  /**
   * @constant HD_KEY_DERIVATION_PATH - Key derivation path for HD keys
   */
  HD_KEY_DERIVATION_PATH: 'm/3000\'/0\''

};
