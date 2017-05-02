'use strict';

const { Transform: TransformStream } = require('stream');
const assert = require('assert');
const MerkleTree = require('mtree');
const crypto = require('crypto');
const utils = require('./utils');


/**
 * Provides interface for proving possession of a file for an
 * {@link AuditStream}
 */
class Proof extends TransformStream {

  /**
   * Verifies the proof given the merkle root and tree depth
   * @static
   * @memberof Proof
   * @param {*} proof - Compact proof result
   * @param {string} root - Merkle tree root from audit leaves
   * @param {number} depth - Depth of the merkle tree
   * @returns {string[]}
   */
  static verify(proof, root, depth) {
    function _getChallengeResponse(tuple) {
      let data = tuple || proof;

      if (data.length === 1) {
        return utils.rmd160sha256(data[0]);
      }

      if (Array.isArray(data[0])) {
        return _getChallengeResponse(data[0]);
      } else {
        return _getChallengeResponse(data[1]);
      }
    }

    function _collapse(proof, leaf, depth) {
      if (depth === 0) {
        assert(proof.length === 1, 'Invalid proof structure');
        const proofhash = utils.rmd160sha256(proof[0]);
        assert(Buffer.compare(proofhash, leaf) === 0, 'Invalid proof value');
        return leaf;
      }

      let hashL, hashR;

      if (Array.isArray(proof[0])) {
        hashL = _collapse(proof[0], leaf, depth - 1);
      } else {
        hashL = proof[0];
      }

      if (Array.isArray(proof[1])) {
        hashR = _collapse(proof[1], leaf, depth - 1);
      } else {
        hashR = proof[1];
      }

      return utils.rmd160sha256(Buffer.concat([
        Buffer.from(hashL, 'hex'),
        Buffer.from(hashR, 'hex')
      ]));
    }

    return [
      _collapse(proof, _getChallengeResponse(), depth - 1),
      root
    ];
  }

 /**
  * @constructor
  * @param {string[]} merkleLeaves - Bottom leaves of the audit merkle tree
  * @param {string|buffer} hexChallenge - The challenge data in hex to prepend
  * to shard
  */
  constructor(leaves, challenge) {
    super({ objectMode: true });
    assert(Array.isArray(leaves), 'Merkle leaves must be an array');
    assert.ok(challenge, 'Invalid challenge supplied');

    this._tree = new MerkleTree(this._generateLeaves(leaves),
                                utils.rmd160sha256);

    if (!Buffer.isBuffer(challenge)) {
      this._challenge = Buffer.from(challenge, 'hex');
    } else {
      this._challenge = challenge;
    }

    this._hasher = crypto.createHash('sha256').update(this._challenge);
    this._proof = null;
  }

  /**
   * Returns the generated proof structure
   * @return {array}
   */
  getProofResult() {
    assert(Array.isArray(this._proof), 'Proof generation is not complete');
    return this._proof;
  }
  /**
   * Handles writing the shard data to the proof stream
   * @private
   */
  _transform(chunk, encoding, next) {
    this._hasher.update(chunk, encoding);
    next();
  }

  /**
   * Generates the proof from the read data
   * @private
   */
  _flush(done) {
    try {
      this._generateProof();
    } catch (err) {
      return done(err);
    }

    this.push(this.getProofResult());
    done();
  }

  /**
   * Returns the index of the associated audit leaf
   * @private
   */
  _findMatchIndex(leaves, leaf) {
    let challengenum = -1;

    for (let l = 0; l < leaves.length; l++) {
      if (Buffer.compare(leaves[l], leaf) === 0) {
        challengenum = l;
        break;
      }
    }

    return challengenum;
  }

  /**
   * Calculate audit response
   * @private
   * @param {string} challenge - Challenge string sent by auditor
   * @returns {string[]} result - Challenge response
   */
  _generateProof() {
    const response = utils.rmd160(this._hasher.digest());
    const leaves = this._tree.level(this._tree.levels() - 1);
    const leaf = utils.rmd160sha256(response);

    let challengenum = this._findMatchIndex(leaves, leaf);
    let branches = [response];

    if (challengenum === -1) {
      return this.emit('error', new Error('Failed to generate proof'));
    }

    for (let i = (this._tree.levels() - 1); i > 0; i--) {
      let level = this._tree.level(i);

      if (challengenum % 2 === 0) {
        branches = [branches, level[challengenum + 1].toString('hex')];
      } else {
        branches = [level[challengenum - 1].toString('hex'), branches];
      }

      challengenum = Math.floor(challengenum / 2);
    }

    this._proof = branches;
  }

  /**
   * Generates the bottom leaves of the tree to the next power of two
   * @private
   * @param {string[]} leaves
   */
  _generateLeaves(leaves) {
    const numEmpty = utils.getNextPowerOfTwo(leaves.length) - leaves.length;
    const emptyLeaves = [];

    for (let i = 0; i < numEmpty; i++) {
      emptyLeaves.push(utils.rmd160sha256(''));
    }

    return leaves.map((i) => Buffer.from(i, 'hex')).concat(emptyLeaves);
  }

}

module.exports = Proof;
