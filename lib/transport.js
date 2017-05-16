'use strict';

const url = require('url');
const merge = require('merge');
const connect = require('connect');
const { HTTPSTransport } = require('kad');
const { Agent } = require('https');


/**
 * Represents the Storj-specific HTTP(S) transport
 */
class Transport extends HTTPSTransport {

  /**
   * Contructs a Storj transport adapter
   * @constructor
   * @param {object} options
   * @see https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
   */
  constructor(options) {
    super(options);
  }

  /**
   * Make sure we explicity set the keepAlive options on requests
   * @private
   */
  _createRequest(options) {
    const request = super._createRequest(merge(options, {
      agent: new Agent({ keepAlive: true, keepAliveMsecs: 25000 }),
      path: '/rpc/',
      rejectUnauthorized: false
    }));
    request.setNoDelay(true);
    return request;
  }

  /**
   * Disable nagle algorithm on connections
   * @private
   */
  _createServer(options) {
    const server = super._createServer(options);
    server.on('connection', (sock) => sock.setNoDelay(true));
    return server;
  }

  /**
   * Handles requests by sending through middleware stack
   * @private
   */
  _handle() {
    const middleware = connect();
    middleware.use(Transport.CORS);
    middleware.use('/rpc/', super._handle.bind(this));
    middleware.use('/shards/', this._shards.bind(this));
    middleware(...arguments);
  }

  /**
   * Handle routing request to shard server
   * @private
   */
  _shards(req, res) {
    const urlobj = url.parse(req.url, true);
    const [, hash] = urlobj.pathname.split('/shards/');

    req.query = urlobj.query;
    req.params = { hash };

    if (req.method === 'POST') {
      this.emit('upload', req, res);
    } else if (req.method === 'GET') {
      this.emit('download', req, res);
    } else {
      res.statusCode = 405;
      res.end();
    }
  }

  /**
   * Applies cross origin headers to responses
   * @static
   * @memberof Transport
   * @private
   */
  static get CORS() {
    return function(req, res, next) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', '*');
      res.setHeader('access-control-allow-headers', '*');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
      } else {
        next();
      }
    }
  }

}

module.exports = Transport;
