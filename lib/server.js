'use strict';

const async = require('async');
const assert = require('assert');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const utils = require('./utils');
const constants = require('./constants');


/**
 * Creates a shard server for sending and receiving consigned file shards
 */
class Server extends EventEmitter {

  /**
   * @constructor
   * @license AGPL-3.0
   * @param {object} options
   * @param {string} options.identity - Node identity key
   * @param {object} options.contracts - Contract database
   * @param {object} options.shards - KFS shard database
   * @param {number} [options.tokenTtl=1800000] - Expire unused token
   */
  constructor(options) {
    super();

    this.identity = options.identity;
    this.shards = options.shards;
    this.contracts = options.contracts;

    this._allowed = new Map();
    this._transfers = 0;
    this._ttl = options.tokenTtl || constants.TOKEN_EXPIRE;

    setInterval(() => this.reapExiredTokens(), this._ttl);
  }

  /**
   * Triggered when a shard has finished uploading to this instance
   * @event Server#shardUploaded
   * @param {object} contract - The contract associated with the upload
   */

  /**
   * Triggered when a shard has finished downloading from this instance
   * @event Server#shardDownloaded
   * @param {object} contract - The contract associated with the download
   */

  /**
   * Triggered when a error occurs
   * @event Server#error
   * @param {error} error
   */

  /**
   * Begin accepting data for the given file hash and token
   * @param {string} token - The authorization token created for transfer
   * @param {string} filehash - The shard hash to allow for the token
   * @param {array} contact - Contact that negotiated the token
   */
  accept(token, filehash, contact) {
    assert(typeof token === 'string', 'Invalid token supplied');
    assert(typeof filehash === 'string', 'Invalid filehash supplied');

    this._allowed.set(token, {
      hash: filehash,
      contact: contact,
      expires: Date.now() + this._ttl
    });
  }

  /**
   * Stop accepting data for the given token
   * @param {string} token - The authorization token created for transfer
   */
  reject(token) {
    assert(typeof token === 'string', 'Invalid token supplied');
    this._allowed.delete(token);
  }

  /**
   * Validates the given token
   * @param {string} token
   * @param {string} hash
   */
  isAuthorized(token, hash) {
    try {
      assert.ok(token, 'You did not supply a token');
      assert.ok(this._allowed.has(token), 'The token is not accepted');
      assert.ok(hash, 'You did not supply the data hash');
      assert(this._allowed.get(token).expires > Date.now(), 'Token expired');
      assert(this._allowed.get(token).hash === hash, 'Token not valid');
    } catch (err) {
      return [false, err];
    }

    return [true, null];
  }

  /**
   * Decrements the active transfer count on early socket close
   * @private
   */
  _handleEarlySocketClose() {
    this.transfers--;
  }

  /**
   * Decrements the active transfer count on request error
   * @private
   */
  _handleRequestError(/* err */) {
    this.transfers--;
  }

  /**
   * Receives the data stream and writes it to storage
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} req
   */
  upload(req, res) {
    const hasher = crypto.createHash('sha256');
    const [isAuthed, authError] = this.isAuthorized(
      req.query.token,
      req.params.hash
    );
    const { contact, hash } = this._allowed.get(req.query.token);
    const contractKey = `${hash}:${contact[1].xpub}`;
    const shardKey = utils.rmd160(hash, 'hex').toString('hex');

    function respond(err, statusCode, message) {
      res.statusCode = statusCode;
      res.end(err ? err.message : message);
    }

    let shardSize = 0;
    let receivedBytes = 0;

    async.waterfall([
      (next) => next(isAuthed ? null : authError, isAuthed ? null : 401),
      (next) => {
        this.contracts.get(contractKey, function(err, contract) {
          if (err) {
            return next(err, 404);
          }

          contract = Contract.from(contract);
          shardSize = contract.get('data_size');

          req.on('error', (err) => this._handleRequestError(err));
          res.on('close', () => this._handleEarlySocketClose());
          this.shards.createWriteStream(
            shardKey,
            (err, writeStream) => next(err, writeStream, contract)
          );
        });
      },
      (writeStream, contract, next) => {
        this.transfers++;

        req.on('data', (chunk) => {
          received += chunk.length;

          hasher.update(chunk);
          writeStream.write(chunk);

          if (received > shardsize) {
            writeStream.destroy(() => null);
            this.transfers--;
            next(new Error('Shard exceeds size defined in contract'), 400);
          }
        });

        req.on('end', () => {
          this.transfers--;

          if (utils.rmd160(hasher.digest()).toString('hex') !== hash) {
            writeStream.destroy(() => null);
            return next(new Error('Hash does not match contract'), 400);
          }

          writeStream.end();
          this.reject(req.query.token);
          this.emit('shardUploaded', item, contact);
          next(null, 200, 'Consignment complete');
        });
      }
    ], respond);
  }

  /**
   * Pumps the data through to the client
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  download(req, res) {
    const [isAuthed, authError] = this.isAuthorized(
      req.query.token,
      req.params.hash
    );
    const { hash } = this._allowed.get(req.query.token);
    const shardKey = utils.rmd160(hash, 'hex').toString('hex');

    function respond(err, statusCode, message) {
      res.statusCode = statusCode;
      res.end(err ? err.message : message);
    }

    async.waterfall([
      (next) => next(isAuthed ? null : authError, isAuthed ? null : 401),
      (next) => {
        this.shards.createReadStream(shardKey, function(err, readStream) {
          if (err) {
            return next(err, 404);
          }

          req.on('error', (err) => this._handleRequestError(err));
          res.on('close', () => this._handleEarlySocketClose());
          next(null, readStream);
        });
      },
      (readStream, next) => {
        this.transfers++;
        res.setHeader('content-type', 'application/octet-stream');
        readStream.on('error', (err) => {
          this.transfers--;
          next(err, 500);
        }).on('end', () => {
          this.transfers--;
          this.emit('shardDownloaded', item, contact);
          this.reject(req.query.token);
        }).pipe(res);
      }
    ], respond);
  }

  /**
   * Enumerates the authorized list and rejects expired
   */
  reapExiredTokens() {
    let now = Date.now();

    for (let token in this._allowed) {
      if (this._allowed.get(token).expires < now) {
        this.reject(token);
      }
    }
  }

}

module.exports = Server;
