'use strict';

var KeyPair = require('../keypair');
var request = require('request');
var stringify = require('json-stable-stringify');
var Message = require('bitcore-message');
var bitcore = require('bitcore-lib');
var ECIES = require('bitcore-ecies');
var crypto = require('crypto');
var assert = require('assert');
var JSONSchema = require('jsen');

/**
 * Interface for sending telemetry data to Storj
 * @constructor
 * @param {String} serviceURI - Location of the telemetry service
 * @param {KeyPair} keypair - Your node's keypair for encrypting payment info
 */
function TelemetryReporter(serviceURI, keypair) {
  if (!(this instanceof TelemetryReporter)) {
    return new TelemetryReporter(serviceURI, keypair);
  }

  assert(typeof serviceURI === 'string', 'Invalid service URI supplied');
  assert(keypair instanceof KeyPair, 'Invalid keypair supplied');

  this._service = serviceURI;
  this._keypair = keypair;

  this._cipher = ECIES().privateKey(
    this._keypair._privkey
  ).publicKey(
    bitcore.PublicKey.fromDER(TelemetryReporter.SERVICE_KEY)
  );
}

/**
 * Telemetry service public key
 * @static
 */
TelemetryReporter.SERVICE_KEY = Buffer(
  '028370c3f05161c2e05bb31068932b0797f8c56f6adf5e13bb731698486f0c58d3', 'hex'
);

/**
 * Telemetry report schema
 * @static
 */
TelemetryReporter.SCHEMA = JSONSchema({
  type: 'object',
  properties: {
    storage: {
      type: 'object',
      properties: {
        free: {
          type: ['integer']
        },
        used: {
          type: ['integer']
        }
      }
    },
    bandwidth: {
      type: 'object',
      properties: {
        upload: {
          type: ['number']
        },
        download: {
          type: ['number']
        }
      }
    },
    contact: {
      type: 'object',
      properties: {
        protocol: {
          type: ['string']
        },
        address: {
          type: ['string']
        },
        port: {
          type: ['integer']
        },
        nodeID: {
          type: ['string']
        }
      }
    },
    payment: {
      type: ['string']
    },
    signature: {
      type: ['string']
    },
    timestamp: {
      type: ['integer']
    }
  }
});

/**
 * Generate a random message ID
 * @private
 */
TelemetryReporter.prototype._createMessageId = function() {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Signs the telemetry report
 * @private
 * @param {Object} report
 * @return {Object}
 */
TelemetryReporter.prototype._addSignatureToReport = function(report) {
  report.signature = Message(
    stringify(report)
  ).sign(this._keypair._privkey);

  return report;
};

/**
 * Adds a timestamp to the telemetry report
 * @private
 * @param {Object} report
 * @return {Object}
 */
TelemetryReporter.prototype._addTimestampToReport = function(report) {
  report.timestamp = Date.now();

  return report;
};

/**
 * Encrypts the payment address to the service public key
 * @private
 * @param {Object} report
 * @return {Object}
 */
TelemetryReporter.prototype._encryptPaymentAddress = function(report) {
  report.payment = this._cipher.encrypt(report.payment).toString('base64');

  return report;
};

/**
 * Send telemetry report
 * @param {Object} report
 * @param {Function} callback
 */
TelemetryReporter.prototype.send = function(report, callback) {
  report = this._addTimestampToReport(report);
  report = this._encryptPaymentAddress(report);
  report = this._addSignatureToReport(report);

  if (!TelemetryReporter.SCHEMA(report)) {
    return callback(new Error('Invalid report supplied'));
  }

  var options = {
    method: 'POST',
    uri: this._service,
    json: {
      method: 'REPORT',
      id: this._createMessageId(),
      params: report
    }
  };

  function handleResponse(err, res, body) {
    if (err) {
      return callback(err);
    }

    if (res.statusCode !== 200) {
      if (!body || !body.error) {
        return callback(new Error('Unknown error response'));
      }

      return callback(new Error(body.error.message));
    }

    callback(null, body.result);
  }

  return request(options, handleResponse);
};

module.exports = TelemetryReporter;
