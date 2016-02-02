'use strict';

var assert = require('assert');
var merge = require('merge');
var time = require('ms');
var JSONSchema = require('jsen');

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

  assert.ok(
    Contract.validate(this._properties),
    'Invalid contract specification was supplied'
  );
}

/**
 * Defines the JSON Schema of a {@link Contract}
 * @static
 */
Contract.Schema = JSONSchema({
  type: 'object',
  properties: {
    version: {
      type: 'number'
    },
    duration: {
      type: 'array',
      items: [
        { type: 'number' },
        { type: 'number' }
      ]
    },
    shard: {
      type: 'object',
      properties: {
        hash: {
          type: 'string',
          minLength: 64,
          maxLength: 64
        },
        size: {
          type: 'number',
          minimum: 0
        }
      }
    },
    parties: {
      type: 'object',
      properties: {
        farmer: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: [
            { type: 'string' },
            { type: 'number' },
            { type: 'string' }
          ]
        },
        renter: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: [
            { type: 'string' },
            { type: 'number' },
            { type: 'string' }
          ]
        }
      }
    },
    payment: {
      type: 'object',
      properties: {
        unit: {
          type: 'string',
          minLength: 3,
          maxLength: 4
        },
        amount: {
          type: 'number',
          minimum: 0
        },
        destination: {
          type: 'string',
          minLength: 26,
          maxLength: 35
        },
        source: {
          type: 'string',
          minLength: 26,
          maxLength: 35
        },
        download: {
          type: 'object',
          properties: {
            price: {
              type: 'number',
              minimum: 0
            }
          }
        },
        schedule: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'number' }
        }
      }
    },
    audit: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string'
        },
        schedule: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'number' }
        }
      }
    }
  }
});

Contract.DEFAULTS = {
  version: 0,
  duration: [Date.now(), Date.now()],
  shard: {
    hash: null,
    size: 0
  },
  parties: {
    farmer: ['0.0.0.0', 1337, '<node_id>'],
    renter: ['0.0.0.0', 1337, '<node_id>']
  },
  payment: {
    unit: 'SJCX',
    amount: 0,
    destination: '<btc_addr>',
    source: '<btc_addr>',
    download: {
      price: 0
    },
    schedule: [time('30d'), 12]
  },
  audit: {
    strategy: '<audit_identifier>',
    schedule: [time('30d'), 12]
  }
};

/**
 * Converts the contract to a plain object
 * @returns {Object}
 */
Contract.prototype.toObject = function() {
  return Object.create(this._properties);
};

/**
 * Converts the contract to JSON string
 * @returns {String}
 */
Contract.prototype.toJSON = function() {
  return JSON.stringify(this.toObject());
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
 * Validates the contract data against the schema
 * @param {Object} contract
 * @returns {Boolean}
 */
Contract.validate = function(contract) {
  return Contract.Schema(contract);
};

module.exports = Contract;
