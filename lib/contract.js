'use strict';

const ms = require('ms');
const merge = require('merge');
const JSONSchema = require('jsen');
const stringify = require('json-stable-stringify');
const constants = require('./constants');
const utils = require('./utils');
const secp256k1 = require('secp256k1');
const { utils: keyutils } = require('kad-spartacus');


/**
 * Represents a storage contract between a renter and a farmer
 */
class Contract {

  /**
   * @constructor
   * @param {object} contract
   * @param {string} contract.type - Unique identifier for the contract
   * @param {string} [contract.renter_hd_key] - Node extended public key in base58
   * @param {number} [contract.renter_hd_index] - Derivation index for signature
   * @param {string} contract.renter_id - Node ID of the renter
   * @param {string} contract.renter_signature - Renter's cryptographic signature
   * @param {string} [contract.farmer_hd_key] - Node extended public key in base58
   * @param {number} [contract.farmer_hd_index] - Derivation index for signature
   * @param {string} contract.farmer_id - Node ID of the farmer
   * @param {string} contract.farmer_signature - Farmer's cryptographic signature
   * @param {number} contract.data_size - Number of bytes to store
   * @param {string} contract.data_hash - RIPEMD-160 SHA-256 hash of the data
   * @param {number} contract.store_begin - UNIX timestamp to start contract
   * @param {number} contract.store_end - UNIX timestamp to end the contract
   * @param {number} contract.audit_count - Number of audits renter will perform
   * @param {string[]} contract.audit_leaves - Merkle leaves for audit tree
   * @param {number} contract.payment_storage_price - Total price for storage
   * @param {number} contract.payment_download_price - Price per download
   * @param {string} contract.payment_destination - Bitcoin address to send funds
   * @param {object} criteria
   * @param {number} criteria.size - Criteria degree OPCODE
   * @param {number} criteria.duration - Criteria degree OPCODE
   * @param {number} criteria.availability - Criteria degree OPCODE
   * @param {number} criteria.speed - Criteria degree OPCODE
   */
  constructor(contract, criteria) {
    this._properties = merge(Contract.DEFAULTS, contract);
    this._criteria = this._inferCriteria(criteria);
    this._clean();
  }

  /**
   * Defines the JSON Schema of a {@link Contract}
   * @static
   */
  static get schema() {
    return {
      type: 'object',
      properties: {
        version: {
          type: ['integer'],
          minimum: 0
        },
        renter_hd_key: {
          type: ['string', 'boolean'],
          pattern: '^[1-9a-km-zA-HJ-NP-Z]{1,111}$'
        },
        renter_hd_index: {
          type: ['integer', 'boolean'],
          minimum: 0,
          maximum: 2147483647
        },
        renter_id: {
          type: ['string', 'null'],
          pattern: '[A-Fa-f0-9]{40}$'
        },
        renter_signature: {
          type: ['string', 'null']
        },
        farmer_hd_key: {
          type: ['string', 'boolean'],
          pattern: '^[1-9a-km-zA-HJ-NP-Z]{1,111}$'
        },
        farmer_hd_index: {
          type: ['integer', 'boolean'],
          minimum: 0,
          maximum: 2147483647
        },
        farmer_id: {
          type: ['string', 'null'],
          pattern: '[A-Fa-f0-9]{40}$'
        },
        farmer_signature: {
          type: ['string', 'null']
        },
        data_size: {
          type: ['integer', 'null'],
          minimum: 0
        },
        data_hash: {
          type: ['string', 'null'],
          pattern: '^[0-9a-f]{40}$'
        },
        store_begin: {
          type: ['integer', 'null'],
          minimum: 0
        },
        store_end: {
          type: ['integer', 'null'],
          minimum: 0
        },
        audit_count: {
          type: ['integer', 'null'],
          minimum: 0
        },
        audit_leaves: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '[A-Fa-f0-9]$'
          }
        },
        payment_storage_price: {
          type: ['integer', 'null']
        },
        payment_download_price: {
          type: ['integer', 'null']
        },
        payment_destination: {
          type: ['string', 'null']
        }
      }
    };
  }

  /**
   * Validation function against the schema
   * @static
   */
  static get validator() {
    return JSONSchema(Contract.schema);
  }

  /**
   * Defines some default properties of a {@link Contract}
   * @static
   */
  static get DEFAULTS() {
    return {
      version: 1,
      renter_hd_key: false,
      renter_hd_index: false,
      renter_id: null,
      renter_signature: null,
      farmer_id: null,
      farmer_signature: null,
      data_size: 1234,
      data_hash: null,
      store_begin: 2000000000,
      store_end: 3000000000,
      audit_count: 10,
      audit_leaves: [],
      payment_storage_price: 0,
      payment_download_price: 0,
      payment_destination: null
    };
  }

  /**
   * Defines some default criteria of a {@link Contract}
   * @static
   */
  static get CRITERIA() {
    return {
      size: constants.OPCODE_DEG_MED,
      duration: constants.OPCODE_DEG_MED,
      availability: constants.OPCODE_DEG_MED,
      speed: constants.OPCODE_DEG_MED
    };
  }

  /**
   * Defines the criteria matrix for a {@link Contract}
   * @static
   */
  static get MATRIX() {
    return {
      size: function(size) {
        if (size > 0 && size <= (32 * 1024 * 1024)) {
          return constants.OPCODE_DEG_LOW;
        }

        if (size > (32 * 1024 * 1024) && size <= (512 * 1024 * 1024)) {
          return constants.OPCODE_DEG_MED;
        }

        if (size > (512 * 1024 * 1024) && size <= (4096 * 1024 * 1024)) {
          return constants.OPCODE_DEG_HIGH;
        }

        return constants.OPCODE_DEG_HIGH;
      },
      duration: function(duration) {
        if (duration > 0 && duration <= ms('30d')) {
          return constants.OPCODE_DEG_LOW;
        }

        if (duration > ms('30d') && duration <= ms('90d')) {
          return constants.OPCODE_DEG_MED;
        }

        if (duration > ms('90d') && duration <= ms('320d')) {
          return constants.OPCODE_DEG_HIGH;
        }

        return constants.OPCODE_DEG_HIGH;
      },
      availability: function(availability) {
        if (availability >= 0.5 && availability <= 0.7) {
          return constants.OPCODE_DEG_LOW;
        }

        if (availability > 0.7 && availability <= 0.9) {
          return constants.OPCODE_DEG_MED;
        }

        if (availability > 0.9 && availability <= 1) {
          return constants.OPCODE_DEG_HIGH;
        }

        return constants.OPCODE_DEG_HIGH;
      },
      speed: function(speed) {
        if (speed > 0 && speed <= 6) {
          return constants.OPCODE_DEG_LOW;
        }

        if (speed > 6 && speed <= 12) {
          return constants.OPCODE_DEG_MED;
        }

        if (speed > 12 && speed <= 32) {
          return constants.OPCODE_DEG_HIGH;
        }

        return constants.OPCODE_DEG_HIGH;
      }
    };
  }

  /**
   * Removes all properties not in the schema from contract
   * @private
   * @param {object} criteria - Criteria degree opcodes
   * @returns {object}
   */
  _inferCriteria(criteria) {
    let opcodes = Contract.CRITERIA;
    opcodes.size = Contract.MATRIX.size(this.get('data_size'));
    opcodes.duration = Contract.MATRIX.duration(
      this.get('store_end') - this.get('store_begin')
    );
    return merge(opcodes, criteria);
  }

  /**
   * Removes all properties not in the schema from contract
   * @private
   * @returns {Contract}
   */
  _clean() {
    const keys = Object.keys(Contract.schema.properties);

    for (let field in this._properties) {
      if (!keys.includes(field)) {
        delete this._properties[field];
      }
    }

    return this;
  }

  /**
   * Validates the contract specification
   * @private
   * @returns {boolean} validity
   */
  isValid() {
    return Contract.validator(this._properties);
  }

  /**
   * Checks if the contract is complete
   * @returns {boolean} completed
   */
  isComplete() {
    for (let prop in this._properties) {
      if (this._properties[prop] === null) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns the string representation of the contract, minus the signature
   * fields, sorted alphanumerically for signing and verifying
   * @returns {string}
   */
  getSigningData() {
    const sorted = this.toObject();

    delete sorted.renter_signature;
    delete sorted.farmer_signature;

    return stringify(sorted);
  }

  /**
   * Signs the contract as the given actor
   * @param {string} actor - One of 'farmer' or 'renter'
   * @param {buffer} secret - ECDSA private key
   * @returns {string} signature
   */
  sign(actor, secret) {
    return this.set(actor + '_signature',
                    this.signExternal(secret).toString('base64'));
  }

  /**
   * Verify the contract signature for the given actor
   * @param {string} actor - One of 'farmer' or 'renter'
   * @returns {boolean}
   */
  verify(actor) {
    const compactSig = Buffer.from(this.get(`${actor}_signature`), 'base64');
    const recovery = compactSig[0];
    const signature = compactSig.slice(1);
    const message = utils.sha256(Buffer.from(this.getSigningData()));
    const pubkey = secp256k1.recover(message, signature, recovery, true);
    const pubkeyhash = this.get(`${actor}_id`);

    return this.verifyExternal(signature, pubkey) &&
      keyutils.toPublicKeyHash(pubkey).toString('hex') === pubkeyhash;
  }

  /**
   * Signs the contract with the proved key and returns the signature
   * @param {string|buffer} secret - ECDSA private key
   * @returns {string}
   */
  signExternal(secret) {
    if (!Buffer.isBuffer(secret)) {
      secret = Buffer.from(secret, 'hex');
    }

    const { signature, recovery } = secp256k1.sign(
      utils.sha256(Buffer.from(this.getSigningData())),
      secret
    );

    return Buffer.concat([Buffer.from([recovery]), signature]);
  }

  /**
   * Verify the provided signature for the contract
   * @param {string} signature - The contract signature to verify
   * @param {string|buffer} pubkey - ECDSA public key
   * @returns {boolean}
   */
  verifyExternal(signature, pubkey) {
    if (!Buffer.isBuffer(pubkey)) {
      pubkey = Buffer.from(pubkey, 'hex');
    }

    return secp256k1.verify(
      utils.sha256(Buffer.from(this.getSigningData())),
      signature,
      pubkey
    );
  }

  /**
   * Applies the provided fields to the contract and validates it
   * @param {object} fields - Contract properties to update
   * @returns {Contract}
   */
  update(fields) {
    for (let prop in fields) {
      this.set(prop, fields[prop]);
    }

    return this;
  }

  /**
   * Returns the value for the given contract property
   * @param {string} field - Contract property to get
   * @returns {string|number|null} value
   */
  get(field) {
    return this._properties[field];
  }

  /**
   * Sets the contract property to the given value
   * @param {string} field - Contract property to set
   * @param {string|number} value - Value to set for field
   * @returns {string|number|null}
   */
  set(field, value) {
    this._properties[field] = value;
    this._clean();
    return this._properties[field];
  }

  /**
   * Calculates the SHA-256 hash of the serialized contract
   * @returns {buffer}
   */
  getHash() {
    return utils.sha256(this.toBuffer());
  }

  /**
   * Return OPCODE byte sequence for contract publication topic
   * @returns {buffer}
   */
  getTopicBuffer() {
    return Contract.createTopic(this._criteria);
  }

  /**
   * Return OPCODE byte sequence for contract publication topic as hex string
   * @returns {string}
   */
  getTopicString() {
    return this.getTopicBuffer().toString('hex');
  }

  /**
   * Converts the contract to a plain object
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toJSON());
  }

  /**
   * Converts the contract to JSON string
   * @returns {string}
   */
  toJSON() {
    return stringify(this._properties);
  }

  /**
   * Converts the contract to Buffer
   * @returns {buffer}
   */
  toBuffer() {
    return new Buffer(this.toJSON(), 'utf8');
  }

  /**
   * Creates a contract from a plain object
   * @static
   * @param {object} object - Dictionary of contract data
   * @returns {Contract}
   */
  static fromObject(object) {
    return new Contract(object);
  }

  /**
   * Creates a contract from a JSON string
   * @param {string} json - JSON encoded contract
   * @returns {Contract}
   */
  static fromJSON(json) {
    return new Contract(JSON.parse(json));
  }

  /**
   * Creates a contract from a Buffer
   * @param {buffer} buffer - Raw binary blob of contract data
   * @returns {Contract}
   */
  static fromBuffer(buffer) {
    return new Contract(JSON.parse(buffer.toString('utf8')));
  }

  /**
   * Infers the type of object supplied and constructs a contract
   * @param {object|string|buffer} data
   * @returns {Contract}
   */
  static from(data) {
    if (Buffer.isBuffer(data)) {
      return Contract.fromBuffer(data);
    } else if (typeof data === 'string') {
      return Contract.fromJSON(data);
    } else {
      return Contract.fromObject(data);
    }
  }

  /**
   * Create a topical OPCODE byte sequence from the provided criteria
   * @param {object} criteria
   * @param {number} criteria.size - Criteria degree OPCODE
   * @param {number} criteria.duration - Criteria degree OPCODE
   * @param {number} criteria.availability - Criteria degree OPCODE
   * @param {number} criteria.speed - Criteria degree OPCODE
   * @returns {buffer}
   */
  static createTopic(criteria) {
    criteria = merge(Contract.CRITERIA, criteria);

    return new Buffer([
      constants.OPCODE_CONTRACT_PREFIX,
      criteria.size,
      criteria.duration,
      criteria.availability,
      criteria.speed
    ]);
  }

  /**
   * Compares two contracts against each other
   * @param {Contract} c1 - Contract to compare
   * @param {Contract} c2 - Contract to compare
   * @returns {boolean}
   */
  static compare(c1, c2) {
    const contract1 = c1.toObject();
    const contract2 = c2.toObject();
    const ignored = [
      'renter_id',
      'renter_signature',
      'farmer_id',
      'farmer_signature',
      'payment_destination'
    ];

    ignored.forEach(function(prop) {
      delete contract1[prop];
      delete contract2[prop];
    });

    return JSON.stringify(contract1) === JSON.stringify(contract2);
  }

  /**
   * Returns the property names between two contracts that differ
   * @param {Contract} c1 - Contract to compare
   * @param {contract} c2 - Contract to compare
   * @returns {string[]} changedProperties
   */
  static diff(c1, c2) {
    const differs = [];

    c1 = c1.toObject();
    c2 = c2.toObject();

    for (let prop in c1) {
      if (Array.isArray(c1[prop])) {
        if (JSON.stringify(c1[prop]) !== JSON.stringify(c2[prop])) {
          differs.push(prop);
        }
      } else if (c1[prop] !== c2[prop]) {
        differs.push(prop);
      }
    }

    return differs;
  }

}

module.exports = Contract;
