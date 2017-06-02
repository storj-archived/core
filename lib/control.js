/**
 * @module storjd/control
 */

'use strict';

const { v4: uuid } = require('uuid');
const { Transform } = require('stream');
const { EventEmitter } = require('events');
const net = require('net');
const jsonrpc = require('jsonrpc-lite');


/**
 * A transform stream that splits up newline terminated JSON and returns
 * JSON-RPC objects
 */
class ControlParser extends Transform {

  /**
   * @constructor
   */
  constructor() {
    super({ objectMode: true });
    this._buffer = '';
  }

  /**
   * @private
   */
  _transform(data, encoding, callback) {
    this._buffer += data.toString();

    if (this._buffer.indexOf('\r\n') === -1) {
      return callback();
    }

    let valid = true;
    let parts = this._buffer.split('\r\n');

    while (valid && parts.length) {
      let rpc = jsonrpc.parse(parts[0]);

      if (rpc.type !== 'invalid') {
        this.push(jsonrpc.parse(parts[0]));
        parts.shift();
      } else {
        valid = false;
      }
    }

    this._buffer = parts.join('\r\n');
    callback();
  }

}

/**
 * Wraps a {@link Node} to provide a control interface over a socket
 */
class ControlServer {

  /**
   * @constructor
   * @param {Node} node - Instance of a storjd node
   */
  constructor(node) {
    this.node = node;
    this.clients = new Map();
    this.server = net.createServer((sock) => this.client(sock));
  }

  /**
   * Bind to the supplied address and port
   * @param {number} port
   * @param {string} address
   * @param {function} callback
   */
  listen(port, address = '127.0.0.1', callback) {
    this.server.listen(port, address, callback);
  }

  /**
   * Handles incoming controller connection
   * @param {object} socket
   */
  client(socket) {
    const id = uuid();
    const parser = new ControlParser();

    this.clients.set(id, socket);

    socket.on('error', () => this.clients.delete(id));
    socket.on('close', () => this.clients.delete(id));
    socket.pipe(parser).on('data', (rpc) => this.exec(rpc, id));
  }

  /**
   * Using the RPC object and client ID, execute the node's method with args
   * and write the result back to the client socket
   * @param {object} rpc
   * @param {string} client
   */
  exec(rpc, client) {
    const socket = this.clients.get(client);


    // TODO: Handle streams for announcements, offers, and descriptors
  }

}

/**
 * Exposes a client control protocol interface for issuing commands
 * to a {@link Node}
 */
class ControlClient extends EventEmitter {

  /**
   * @constructor
   */
  constructor() {
    super();
    this.socket = new net.Socket();
    this.socket.on('connect', () => this.emit('ready'));
    this.socket.on('error', (err) => this.emit('error', err));
  }

  /**
   * Opens a socket connection to the control port
   * @param {number} port
   */
  connect(port) {
    const parser = new ControlParser();

    this.socket.connect(port);
    this.socket.pipe(parser).on('data', (rpc) => this.process(rpc));
  }

  /**
   * Processes received RPC messages from the control port
   * @param {object} rpc
   */
  process(rpc) {

  }

}

module.exports = {
  Server: ControlServer,
  Client: ControlClient,
  Parser: ControlParser
};
