'use strict';

const { randomBytes } = require('crypto');
const async = require('async');
const utils = require('./utils');
const Contract = require('./contract');
const ProofStream = require('./proof');


/**
 * Represents Storj protocol handlers
 */
class Rules {

  /**
   * Constructs a Storj rules instance in the context of a Storj node
   * @constructor
   * @param {StorjNode} node
   */
  constructor(node) {
    this.node = node;
  }

  /**
   * Upon receipt of an OFFER message, nodes must validate the descriptor,
   * then ensure that the referenced shard is awaiting allocation(s). If both
   * checks succeed, then the descriptor is added to the appropriate offer
   * processing stream. Once the descriptor is processed, we respond back to
   * the originator with the final copy of the contract.
   * @param {object} request
   * @param {object} response
   */
  offer(request, response, next) {
    const [descriptor] = request.params;
    const contract = Contract.from(descriptor);
    const shardKey = contract.get('data_hash');
    const offerStream = this.node.offers.get(shardKey);

    if (!(contract.isValid() && contract.isComplete())) {
      return next(new Error('Invalid shard descriptor'));
    }

    if (!offerStream) {
      return next(new Error('Offers for descriptor are closed'));
    }

    offerStream.queue(request.contact, contract, (err, result) => {
      if (err) {
        return next(err);
      }

      response.send([result.toObject()]);
    });
  }

  /**
   * Upon receipt of a AUDIT message, the node must look up the contract that
   * is associated with each hash-challenge pair in the payload, prepend the
   * challenge to the shard data, and caclulate the resulting hash, formatted
   * as a compact proof. See {@tutorial compact-proofs}.
   * @param {object} request
   * @param {object} response
   */
  audit(request, response, next) {
    const audits = request.params;
    const [, { xpub }] = request.contact;

    if (!Array.isArray(audits)) {
      return next(new Error('Invalid audit batch supplied'));
    }

    async.mapSeries(audits, ({ hash, challenge }, done) => {
      this.node.contracts.get(`${hash}:${xpub}`, (err, desc) => {
        if (err) {
          return done(null, { hash, proof: null });
        }

        const contract = Contract.from(desc);
        const auditLeaves = contract.get('audit_leaves');
        const proofStream = new ProofStream(auditLeaves, challenge);
        const shardKey = utils.rmd160(hash, 'hex').toString('hex');

        proofStream.on('error', () => {
          proofStream.removeAllListeners('finish');
          done(null, { hash, proof: null });
        });

        proofStream.on('finish', () => {
          proofStream.removeAllListeners('error');
          done(null, { hash, proof: proofStream.getProofResult() });
        });

        this.node.shards.createReadStream(shardKey, (err, shardStream) => {
          if (err) {
            return done(null, { hash, proof: null });
          }

          shardStream.pipe(proofStream);
        });
      });
    }, (err, proofs) => response.send(proofs));
  }

  /**
   * Upon receipt of a CONSIGN message, the node must verify that it has a
   * valid storage allocation and contract for the supplied hash and identity
   * of the originator. If so, it must generate an authorization token which
   * will be checked by the shard server before accepting the transfer of the
   * associated shard.
   * @param {object} request
   * @param {object} response
   */
  consign(request, response, next) {
    const [hash] = request.params;
    const { contact } = request;

    this.node.contracts.get(`${hash}:${contact[1].xpub}`, (err, desc) => {
      if (err) {
        return next(err);
      }

      const now = Date.now();
      const contract = Contract.from(desc);
      const token = randomBytes(32).toString('hex');

      if (now > contract.get('store_end')) {
        return next(new Error('Contract has expired'));
      }

      this.node.server.accept(token, hash, contact);
      response.send([token]);
    });
  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  mirror() {
    // TODO
  }

  /**
   * Upon receipt of a RETRIEVE message, the node must verify that it is in
   * possession of the shard on behalf of the identity of the originator.
   * If so, it must generate an authorization token which will be checked by
   * the shard server before accepting the transfer of the associated shard.
   * @param {object} request
   * @param {object} response
   */
  retrieve(request, response, next) {
    const [hash] = request.params;
    const { contact } = request;

    this.node.contracts.get(`${hash}:${contact[1].xpub}`, (err) => {
      if (err) {
        return next(err);
      }

      const token = randomBytes(32).toString('hex');
      const shardKey = utils.rmd160(hash, 'hex');

      this.node.shards.exists(shardKey, (err, exists) => {
        if (err || !exists) {
          return next(err || new Error('Shard not found'));
        }

        this.node.transport.shardServer.accept(token, hash, contact);
        response.send([token]);
      });
    });
  }

  /**
   * Upon receipt of a PROBE message, the node must attempt to send a PING
   * message to the originator using the declared contact information. If
   * successful, it must respond positively, otherwise error.
   * @param {object} request
   * @param {object} response
   */
  probe(request, response, next) {
    this.node.ping(request.contact, (err) => {
      if (err) {
        return next(new Error('Failed to reach probe originator'));
      }

      response.send([]);
    });
  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  trigger(request, response, next) {
    const [behavior, contents] = request.params;
    const [identity] = request.contact;

    this.node.triggers.process(identity, behavior, contents, (err, result) => {
      if (err) {
        return next(err);
      }

      response.send(result);
    });
  }

  /**
   * Upon receipt of a RENEW message, the recipient farmer must extend or
   * terminate it's contract based on the new terms supplied by the renter.
   * If the renewal descriptor is valid and complete, the farmer must store
   * the updated version after signing and respond back to the originator
   * with the version containing the updated signature.
   * @param {object} request
   * @param {object} response
   */
  renew(request, response, next) {
    const [descriptor] = request.params;
    const renewal = Contract.from(descriptor);
    const hash = renewal.get('data_hash');
    const [, { xpub }] = request.contact;
    const key = `${hash}:${xpub}`;

    if (!(renewal.isValid() && renewal.isComplete())) {
      return next(new Error('Descriptor is invalid or incomplete'));
    }

    this.node.contracts.get(key, (err, desc) => {
      if (err) {
        return next(err);
      }

      const allowed = [
        'renter_id',
        'renter_hd_key',
        'renter_signature',
        'store_begin',
        'store_end',
        'audit_leaves'
      ];
      const original = Contract.from(desc);
      const difference = Contract.diff(original, renewal);

      for (let prop of difference) {
        if (!allowed.includes(prop)) {
          return next(new Error(`Rejecting renewal of ${prop}`));
        }
      }

      renewal.sign('farmer', this.node.spartacus.privateKey);
      this.node.contracts.put(key, renewal.toObject(), (err) => {
        if (err) {
          return next(err);
        }

        response.send(renewal.toObject());
      });
    });
  }

}

module.exports = Rules;
