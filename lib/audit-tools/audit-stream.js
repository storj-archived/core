'use strict';

var assert = require('assert');
var crypto = require('crypto');
var constants = require('../constants');
var MerkleTree = require('mtree');
var utils = require('../utils');
var stream = require('readable-stream');
var inherits = require('util').inherits;

/**
 * Represents a streaming audit challenge generator
 * @constructor
 * @license LGPL-3.0
 * @param {Number} audits - Total number of challenges to generate
 * @emits AuditStream#finish
 */
function AuditStream(audits) {
  if (!(this instanceof AuditStream)) {
    return new AuditStream(audits);
  }

  assert(typeof audits === 'number', 'Invalid number of audits supplied');
  assert(!Number.isNaN(audits), 'Invalid number of audits supplied');
  assert(Number.isFinite(audits), 'Invalid number of audits supplied');

  this._audits = audits;
  this._finished = false;
  this._challenges = [];
  this._inputs = this._prepareChallenges();

  stream.Writable.call(this);
  this.on('finish', this._generateTree.bind(this));
}

/**
 * Triggered when the stream has ended
 * @event AuditStream#finish
 */

inherits(AuditStream, stream.Writable);

/**
 * Returns the bottom leaves of the merkle tree for sending to farmer
 * @returns {Array} leaves - Bottom merkle leaves of audit tree
 */
AuditStream.prototype.getPublicRecord = function() {
  assert(this._finished, 'Challenge generation is not finished');

  return this._tree.level(this._tree.levels() - 1);
};

/**
 * Returns the challenges, the tree depth, and merkle root
 * @returns {Object} challenge - Private audit record with challenges
 */
AuditStream.prototype.getPrivateRecord = function() {
  assert(this._finished, 'Challenge generation is not finished');

  return {
    root: this._tree.root(),
    depth: this._tree.levels(),
    challenges: this._challenges
  };
};

/**
 * Implements the underlying write method
 * @private
 */
AuditStream.prototype._write = function(bytes, encoding, next) {
  var self = this;

  this._inputs.forEach(function(input, i) {
    if (i < self._audits) {
      input.update(bytes.toString('hex'));
    }
  });
  next();
};

/**
 * Prepares the challenge hasher instances
 * @private
 */
AuditStream.prototype._prepareChallenges = function() {
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

  return inputs;
};

/**
 * Generate the audit merkle tree from a series of challenges
 * @private
 */
AuditStream.prototype._generateTree = function() {
  var self = this;

  this._finished = true;

  this._tree = new MerkleTree(this._inputs.map(function(input, i) {
    if (i >= self._audits) {
      return input;
    } else {
      return utils.rmd160sha256(utils.rmd160(input.digest('hex')));
    }
  }), utils.rmd160sha256);
};

/**
 * Generate a random challenge buffer
 * @private
 * @returns {String} Hex encoded random bytes
 */
AuditStream.prototype._generateChallenge = function() {
  return crypto.randomBytes(constants.AUDIT_BYTES).toString('hex');
};

/**
 * Create a challenge response input to merkle tree
 * @private
 */
AuditStream.prototype._createResponseInput = function(challenge) {
  return crypto.createHash('sha256').update(challenge);
};

/**
 * Returns a new instance from the predefined challenges and tree
 * @param {Array} challenges - The precomputed challenges
 * @param {Array} tree - The bottom leaves of the existing merkle tree
 * @returns {AuditStream}
 */
AuditStream.fromRecords = function(challenges, tree) {
  assert(Array.isArray(challenges), 'Invalid challenges supplied');
  assert(Array.isArray(tree), 'Invalid tree supplied');
  assert(
    tree.length === utils.getNextPowerOfTwo(challenges.length),
    'Challenges and tree do not match'
  );

  var auditor = new AuditStream(challenges.length);

  auditor._challenges = challenges;
  auditor._tree = new MerkleTree(tree, utils.rmd160sha256);
  auditor._finished = true;

  return auditor;
};

module.exports = AuditStream;
