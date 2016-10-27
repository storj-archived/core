'use strict';

var assert = require('assert');
var crypto = require('crypto');
var merge = require('merge');
var JSONSchema = require('jsen');
var stringify = require('json-stable-stringify');
var bitcore = require('bitcore-lib');
var constants = require('../constants');
var Message = require('bitcore-message');
var ms = require('ms');

/**
 * Represents a storage contract between a renter and a farmer
 * @constructor
 * @license AGPL-3.0
 * @version 0
 * @param {Object} contract
 * @param {String} contract.type - Unique identifier for the contract
 * @param {String} [contract.renter_hd_key] - Node extended public key in base58
 * @param {Number} [contract.renter_hd_index] - Derivation index for signature
 * @param {String} contract.renter_id - Node ID of the renter
 * @param {String} contract.renter_signature - Renter's cryptographic signature
 * @param {String} contract.farmer_id - Node ID of the farmer
 * @param {String} contract.farmer_signature - Farmer's cryptographic signature
 * @param {Number} contract.data_size - Number of bytes to store
 * @param {String} contract.data_hash - RIPEMD-160 SHA-256 hash of the data
 * @param {Number} contract.store_begin - UNIX timestamp to start contract
 * @param {Number} contract.store_end - UNIX timestamp to end the contract
 * @param {Number} contract.audit_count - Number of audits renter will perform
 * @param {Number} contract.payment_storage_price - Total price for storage
 * @param {Number} contract.payment_download_price - Price per download
 * @param {String} contract.payment_destination - Bitcoin address to send funds
 * @param {Object} criteria
 * @param {Number} criteria.size - Criteria degree OPCODE
 * @param {Number} criteria.duration - Criteria degree OPCODE
 * @param {Number} criteria.availability - Criteria degree OPCODE
 * @param {Number} criteria.speed - Criteria degree OPCODE
 */

function Contract(contract, criteria) {
  if (!(this instanceof Contract)) {
    return new Contract(contract, criteria);
  }

  this._properties = merge(Object.create(Contract.DEFAULTS), contract);
  this._criteria = this._inferCriteria(criteria);

  this._clean();
  assert.ok(this._validate(), 'Invalid contract specification was supplied');
}

/**
 * Defines the JSON Schema of a {@link Contract}
 * @static
 */
Contract.Schema = require('./schema.json');
Contract.validate = JSONSchema(Contract.Schema);

/**
 * Defines some default properties of a {@link Contract}
 * @static
 */
Contract.DEFAULTS = {
  version: 0,
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
  payment_storage_price: 0,
  payment_download_price: 0,
  payment_destination: null
};

/**
 * Defines some default criteria of a {@link Contract}
 * @static
 */
Contract.CRITERIA = {
  size: constants.OPCODE_DEG_MED,
  duration: constants.OPCODE_DEG_MED,
  availability: constants.OPCODE_DEG_MED,
  speed: constants.OPCODE_DEG_MED
};

/**
 * Defines the criteria matrix for a {@link Contract}
 * @static
 */
Contract.MATRIX = {
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

/**
 * Removes all properties not in the schema from contract
 * @private
 * @param {Object} criteria - Criteria degree opcodes
 * @returns {Object}
 */
Contract.prototype._inferCriteria = function(criteria) {
  var opcodes = Object.create(Contract.CRITERIA);

  opcodes.size = Contract.MATRIX.size(this.get('data_size'));
  opcodes.duration = Contract.MATRIX.duration(
    this.get('store_end') - this.get('store_begin')
  );
  // NB: Do not try to infer availability or speed, should be explicit

  return merge(opcodes, criteria);
};

/**
 * Removes all properties not in the schema from contract
 * @private
 * @returns {Contract} self
 */
Contract.prototype._clean = function() {
  var keys = Object.keys(Contract.Schema.properties);

  for (var field in this._properties) {
    if (keys.indexOf(field) === -1) {
      delete this._properties[field];
    }
  }

  return this;
};

/**
 * Validates the contract specification
 * @private
 * @returns {Boolean} validity
 */
Contract.prototype._validate = function() {
  return Contract.validate(this._properties);
};

/**
 * Checks if the contract is complete
 * @returns {Boolean} completed
 */
Contract.prototype.isComplete = function() {
  for (var prop in this._properties) {
    if (this._properties[prop] === null) {
      return false;
    }
  }

  return true;
};

/**
 * Returns the string representation of the contract, minus the signature
 * fields, sorted alphanumerically for signing and verifying
 * @returns {String}
 */
Contract.prototype.getSigningData = function() {
  var sorted = this.toObject();

  delete sorted.renter_signature;
  delete sorted.farmer_signature;

  return stringify(sorted);
};

/**
 * Signs the contract as the given actor
 * @param {String} actor - One of 'farmer' or 'renter'
 * @param {Buffer} secret - ECDSA private key
 * @returns {String} signature
 */
Contract.prototype.sign = function(actor, secret) {
  return this.set(actor + '_signature', this.signExternal(secret));
};

/**
 * Verify the contract signature for the given actor
 * @param {String} actor - One of 'farmer' or 'renter'
 * @param {Buffer} pubkeyhash - ECDSA nodeID
 * @returns {Boolean} isValidSignature
 */
Contract.prototype.verify = function(actor, pubkeyhash) {
  return this.verifyExternal(
    this.get(actor + '_signature'),
    pubkeyhash
  );
};

/**
 * Signs the contract with the proved key and returns the signature
 * @param {String} secret - ECDSA private key
 * @returns {String} externalSignature
 */
Contract.prototype.signExternal = function(secret) {
  var message = Message(this.getSigningData());
  return message.sign(bitcore.PrivateKey.fromString(secret));
};

/**
 * Verify the provided signature for the contract
 * @param {String} signature - The contract signature to verify
 * @param {String} pubkeyhash - ECDSA nodeID
 * @returns {Boolean} isValidSignature
 */
Contract.prototype.verifyExternal = function(signature, pubkeyhash) {
  if (!pubkeyhash) {
    return false;
  }

  var message = Message(this.getSigningData());
  var address = bitcore.Address.fromPublicKeyHash(Buffer(pubkeyhash, 'hex'));

  try {
    return message.verify(address, signature);
  } catch (err) {
    return false;
  }
};

/**
 * Applies the provided fields to the contract and validates it
 * @param {Object} fields - Contract properties to update
 * @returns {Contract} self
 */
Contract.prototype.update = function(fields) {
  for (var prop in fields) {
    this.set(prop, fields[prop]);
  }

  return this;
};

/**
 * Returns the value for the given contract property
 * @param {String} field_name - Contract property to get
 * @returns {String|Number|null} value
 */
Contract.prototype.get = function(field_name) {
  return this._properties[field_name];
};

/**
 * Sets the contract property to the given value
 * @param {String} field_name - Contract property to get
 * @returns {String|Number|null} value
 */
Contract.prototype.set = function(field_name, field_value) {
  this._properties[field_name] = field_value;

  this._clean();
  assert.ok(this._validate(), 'Invalid contract property supplied');

  return this._properties[field_name];
};

/**
 * Calculates the SHA-256 hash of the serialized contract
 * @returns {Buffer}
 */
Contract.prototype.getHash = function() {
  return crypto.createHash('sha256').update(this.toBuffer()).digest();
};

/**
 * Return OPCODE byte sequence for contract publication topic
 * @returns {Buffer}
 */
Contract.prototype.getTopicBuffer = function() {
  return Contract.createTopic(this._criteria);
};

/**
 * Return OPCODE byte sequence for contract publication topic as hex string
 * @returns {String}
 */
Contract.prototype.getTopicString = function() {
  return this.getTopicBuffer().toString('hex');
};

/**
 * Converts the contract to a plain object
 * @returns {Object}
 */
Contract.prototype.toObject = function() {
  return JSON.parse(this.toJSON());
};

/**
 * Converts the contract to JSON string
 * @returns {String}
 */
Contract.prototype.toJSON = function() {
  return stringify(this._properties);
};

/**
 * Converts the contract to Buffer
 * @returns {Buffer}
 */
Contract.prototype.toBuffer = function() {
  return new Buffer(this.toJSON(), 'utf8');
};

/**
 * Creates a contract from a plain object
 * @param {Object} object - Dictionary of contract data
 * @returns {Contract}
 */
Contract.fromObject = function(object) {
  return new Contract(object);
};

/**
 * Creates a contract from a JSON string
 * @param {String} json - JSON encoded contract
 * @returns {Contract}
 */
Contract.fromJSON = function(json) {
  return new Contract(JSON.parse(json));
};

/**
 * Creates a contract from a Buffer
 * @param {Buffer} buffer - Raw binary blob of contract data
 * @returns {Contract}
 */
Contract.fromBuffer = function(buffer) {
  return new Contract(JSON.parse(buffer.toString('utf8')));
};

/**
 * Create a topical OPCODE byte sequence from the provided criteria
 * @param {Object} criteria
 * @param {Number} criteria.size - Criteria degree OPCODE
 * @param {Number} criteria.duration - Criteria degree OPCODE
 * @param {Number} criteria.availability - Criteria degree OPCODE
 * @param {Number} criteria.speed - Criteria degree OPCODE
 * @returns {Buffer}
 */
Contract.createTopic = function(criteria) {
  criteria = merge(Object.create(Contract.CRITERIA), criteria);

  return new Buffer([
    constants.OPCODE_CONTRACT_PREFIX,
    criteria.size,
    criteria.duration,
    criteria.availability,
    criteria.speed
  ]);
};

/**
 * Compares two contracts against each other
 * @param {Contract} c1 - Contract to compare
 * @param {Contract} c2 - Contract to compare
 * @returns {Boolean}
 */
Contract.compare = function(c1, c2) {
  var contract1 = c1.toObject();
  var contract2 = c2.toObject();
  var ignored = [
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
};

/**
 * Returns the property names between two contracts that differ
 * @param {Contract} c1 - Contract to compare
 * @param {contract} c2 - Contract to compare
 * @returns {String[]} changedProperties
 */
Contract.diff = function(c1, c2) {
  var differs = [];
  var contract1 = c1.toObject();
  var contract2 = c2.toObject();

  for (var prop in contract1) {
    if (contract1[prop] !== contract2[prop]) {
      differs.push(prop);
    }
  }

  return differs;
};

module.exports = Contract;
