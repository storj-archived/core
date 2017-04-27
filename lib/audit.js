'use strict';

const { Writable: WritableStream } = require('stream');
const assert = require('assert');
const crypto = require('crypto');
const constants = require('./constants');
const MerkleTree = require('mtree');
const utils = require('./utils');


/**
 * Represents a streaming audit challenge generator
 */
class Audit extends WritableStream {

  /**
   * @constructor
   * @param {number} audits - Total number of challenges to generate
   */
  constructor(audits) {
    super();

    assert(typeof audits === 'number', 'Invalid number of audits supplied');
    assert(!Number.isNaN(audits), 'Invalid number of audits supplied');
    assert(Number.isFinite(audits), 'Invalid number of audits supplied');

    this._audits = audits;
    this._finished = false;
    this._challenges = [];
    this._inputs = this._prepareChallenges();

    this.on('finish', this._generateTree.bind(this));
  }

  /**
   * Returns the bottom leaves of the merkle tree for sending to farmer
   * @returns {Array} leaves - Bottom merkle leaves of audit tree
   */
  getPublicRecord() {
    assert(this._finished, 'Challenge generation is not finished');
    return this._tree.level(this._tree.levels() - 1)
      .map((i) => i.toString('hex'));
  }

  /**
   * Returns the challenges, the tree depth, and merkle root
   * @returns {Object} challenge - Private audit record with challenges
   */
  getPrivateRecord() {
    assert(this._finished, 'Challenge generation is not finished');
    return {
      root: this._tree.root(),
      depth: this._tree.levels(),
      challenges: this._challenges.map((i) => i.toString('hex'))
    };
  }

  /**
   * Implements the underlying write method
   * @private
   */
  _write(bytes, encoding, next) {
    this._inputs.forEach((input, i) => {
      if (i < this._audits) {
        input.update(bytes);
      }
    });
    next();
  }

  /**
   * Prepares the challenge hasher instances
   * @private
   */
  _prepareChallenges() {
    let iterations = 0;
    let inputs = [];

    while (iterations < this._audits) {
      const challenge = this._generateChallenge();
      const input = this._createResponseInput(challenge);

      this._challenges.push(challenge);
      inputs.push(input);
      iterations++;
    }

    while (iterations < utils.getNextPowerOfTwo(this._audits)) {
      inputs.push(utils.rmd160sha256(''));
      iterations++;
    }

    return inputs;
  }

  /**
   * Generate the audit merkle tree from a series of challenges
   * @private
   */
  _generateTree() {
    this._finished = true;
    this._tree = new MerkleTree(this._inputs.map((input, i) => {
      if (i >= this._audits) {
        return input;
      } else {
        return utils.rmd160sha256(utils.rmd160(input.digest()));
      }
    }), utils.rmd160sha256);
  }

  /**
   * Generate a random challenge buffer
   * @private
   * @returns {buffer}
   */
  _generateChallenge() {
    return crypto.randomBytes(constants.AUDIT_BYTES);
  }

  /**
   * Create a challenge response input to merkle tree
   * @private
   */
  _createResponseInput(challenge) {
    return crypto.createHash('sha256').update(challenge);
  }

  /**
   * Returns a new instance from the predefined challenges and tree
   * @param {array} challenges - The precomputed challenges
   * @param {array} tree - The bottom leaves of the existing merkle tree
   * @returns {Audit}
   */
  static fromRecords(challenges, tree) {
    assert(Array.isArray(challenges), 'Invalid challenges supplied');
    assert(Array.isArray(tree), 'Invalid tree supplied');
    assert(
      tree.length === utils.getNextPowerOfTwo(challenges.length),
      'Challenges and tree do not match'
    );

    tree = tree.map((i) => Buffer.from(i, 'hex'));

    const auditor = new Audit(challenges.length);

    auditor._challenges = challenges;
    auditor._tree = new MerkleTree(tree, utils.rmd160sha256);
    auditor._finished = true;

    return auditor;
  }

}

module.exports = Audit;
