'use strict';

var assert = require('assert');
var crypto = require('crypto');
var constants = require('./constants');
var MerkleTree = require('mtree');
var merge = require('merge');
var utils = require('./utils');

/**
 * Represents an auditing interface using a precomputed merkle tree
 * @constructor
 * @deprecated Since v0.6.8 - use {@link AuditStream} instead
 * @param {Object} options
 * @param {Number} options.audits - Total number of challenges to generate
 * @param {Buffer} options.shard - Data to create audit challenges for
 */
function Audit(options) {
  if (!(this instanceof Audit)) {
    return new Audit(options);
  }

  options = merge(Object.create(Audit.DEFAULTS), options);

  assert(Buffer.isBuffer(options.shard), 'Invalid shard supplied');
  assert(
    options.audits > 0 && (options.audits % 2 === 0),
    'Must supply an even audits value greater than 0'
  );

  this._shard = options.shard;
  this._audits = options.audits;
  this._challenges = [];
  this._tree = this._generateTree();
}

Audit.DEFAULTS = {
  audits: 12,
  shard: new Buffer([]),
};

/**
 * Returns the bottom leaves of the merkle tree for sending to farmer
 * @returns {Array} leaves - Bottom merkle leaves of audit tree
 */
Audit.prototype.getPublicRecord = function() {
  return this._tree.level(this._tree.levels() - 1);
};

/**
 * Returns the challenges, the tree depth, and merkle root
 * @returns {Object} challenge - Private audit record with challenges
 */
Audit.prototype.getPrivateRecord = function() {
  return {
    root: this._tree.root(),
    depth: this._tree.levels(),
    challenges: this._challenges
  };
};

/**
 * Generate the audit merkle tree from a series of challenges
 * @private
 * @returns {Audit} self
 */
Audit.prototype._generateTree = function() {
  var iterations = 0;
  var inputs = [];

  while (iterations < this._audits) {
    var challenge = this._generateChallenge();
    var input = this._createResponseInput(challenge);

    this._challenges.push(challenge);
    inputs.push(input);

    iterations++;
  }

  while (iterations < utils.getNextPowerOfTwo(this._audits)) {
    inputs.push(utils.rmd160sha256(''));
    iterations++;
  }

  return new MerkleTree(inputs, utils.rmd160sha256);
};

/**
 * Generate a random challenge buffer
 * @private
 * @returns {String} Hex encoded random bytes
 */
Audit.prototype._generateChallenge = function() {
  return crypto.randomBytes(constants.AUDIT_BYTES).toString('hex');
};

/**
 * Create a challenge response input to merkle tree
 * @private
 * @param {Array} response
 * @returns {Buffer} input - Concatenated challenge+shard_hash
 */
Audit.prototype._createResponseInput = function(challenge) {
  return utils.rmd160sha256(utils.rmd160sha256(
    challenge + this._shard.toString('hex')
  ));
};

module.exports = Audit;
