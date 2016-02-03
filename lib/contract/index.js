'use strict';

var assert = require('assert');
var crypto = require('crypto');
var merge = require('merge');
var JSONSchema = require('jsen');
var elliptic = require('elliptic');
var stringify = require('json-stable-stringify');
var ecdsa = new elliptic.ec(elliptic.curves.secp256k1);

/**
 * Represents a storage contract
 * @constructor
 * @version 0
 * @param {Object} contract
 *
 */
function Contract(contract) {
  if (!(this instanceof Contract)) {
    return new Contract(contract);
  }

  this._properties = merge(Object.create(Contract.DEFAULTS), contract);
  this._validator = Contract.createValidator();

  this._clean();
  assert.ok(this._validate(), 'Invalid contract specification was supplied');
}

/**
 * Defines the JSON Schema of a {@link Contract}
 * @static
 */
Contract.Schema = require('./schema.json');

/**
 * Defines some default properties of a {@link Contract}
 * @static
 */
Contract.DEFAULTS = {
  type: '56ce3e837f575827cb5a94e2b609756a48fa4a3882f5e762b262af31f432878d',
  renter_id: null,
  renter_address: '127.0.0.1',
  renter_port: 12345,
  renter_signature: null,
  farmer_id: null,
  farmer_address: '127.0.0.2',
  farmer_port: 12345,
  farmer_signature: null,
  data_size: 1234,
  data_hash: null,
  store_begin: 2000000000,
  store_duration: 1000000000,
  store_end: 3000000000,
  audit_algorithm: 'default',
  audit_count: 10,
  payment_currency: 'SJCX',
  payment_amount: 0,
  payment_download_price: 0,
  payment_destination: null,
  payment_source: null,
  payment_begin: 2000000000,
  payment_settlements: 0,
  payment_interval: 0
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
  return this._validator(this._properties);
};

/**
 * Checks if the contract is complete
 * @private
 * @returns {Boolean} completed
 */
Contract.prototype._complete = function() {
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
 * @private
 * @returns {String}
 */
Contract.prototype._getSigningData = function() {
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
  var property = actor + '_signature';
  var signature = ecdsa.sign(this._getSigningData(), secret).toDER('hex');

  return this.set(property, Buffer(signature, 'hex').toString('base64'));
};

/**
 * Verify the contract signature for the given actor
 * @param {String} actor - One of 'farmer' or 'renter'
 * @param {Buffer} pubkey - ECDSA public key
 * @returns {Boolean} validity
 */
Contract.prototype.verify = function(actor, pubkey) {
  var property = actor + '_signature';

  return ecdsa.verify(
    this._getSigningData(),
    new Buffer(this.get(property), 'base64'),
    pubkey
  );
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
 * @param {Object} object
 * @returns {Contract}
 */
Contract.fromObject = function(object) {
  return new Contract(object);
};

/**
 * Creates a contract from a JSON string
 * @param {String} json
 * @returns {Contract}
 */
Contract.fromJSON = function(json) {
  return new Contract(JSON.parse(json));
};

/**
 * Creates a contract from a Buffer
 * @param {Buffer} buffer
 * @returns {Contract}
 */
Contract.fromBuffer = function(buffer) {
  return new Contract(JSON.parse(buffer.toString('utf8')));
};

/**
 * Creates a validator function for data against the schema
 * @returns {Function} validator
 */
Contract.createValidator = function() {
  return JSONSchema(Contract.Schema);
};

module.exports = Contract;
