/**
 * @module storjd/control
 */

'use strict';

const { Stream, Readable } = require('stream');
const Node = require('./node');
const { v4: uuid } = require('uuid');
const { Transform } = require('stream');
const { EventEmitter } = require('events');
const net = require('net');
const jsonrpc = require('jsonrpc-lite');


/**
 * A transform stream that accepts JSON RPC objects and returns newline
 * terminated JSON strings
 */
class ControlSerializer extends Transform {

  /**
   * @constructor
   */
  constructor() {
    super({ objectMode: true });
  }

  /**
   * @private
   */
  _transform(data, encoding, callback) {
    callback(null, JSON.stringify(data) + '\r\n');
  }

}

/**
 * A transform stream that splits up newline terminated JSON and returns
 * JSON-RPC objects
 */
class ControlDeserializer extends Transform {

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
    this._streams = new Map();
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
    const serializer = new ControlSerializer();
    const deserializer = new ControlDeserializer();

    this.clients.set(id, { socket, serializer, deserializer });

    socket.on('error', () => this.clients.delete(id));
    socket.on('close', () => this.clients.delete(id));
    socket.pipe(deserializer).on('data', (rpc) => this.exec(rpc, id));
  }

  /**
   * Using the RPC object and client ID, execute the node's method with args
   * and write the result back to the client socket
   * @param {object} rpc
   * @param {string} client
   */
  exec(rpc, client) {
    const self = this;
    const { serializer } = this.clients.get(client);
    const { payload } = rpc;

    if (typeof this.node[payload.method] !== 'function') {
      return serializer.write(
        jsonrpc.error(payload.id, new jsonrpc.JsonRpcError(
          `Invalid method: "${payload.method}"`
        ))
      );
    }

    this.node[payload.method](...payload.params, function(err) {
      if (err) {
        return serializer.write(
          jsonrpc.error(payload.id, new jsonrpc.JsonRpcError(err.message))
        );
      }

      for (let a = 0; a < [...arguments].length; a++) {
        if (arguments[a] instanceof Stream) {
          let stream = arguments[a];
          let id = uuid();

          self._streams.set(id, stream);
          stream.on('data', (data) => {
            serializer.write(jsonrpc.notification(`stream:${id}`, [data]));
          });
          stream.on('end', () => {
            serializer.write(jsonrpc.notification(`stream:${id}`, [null]));
          });
          stream.on('error', () => {
            serializer.write(jsonrpc.notification(`stream:${id}`, [null]));
          });

          arguments[a] = `stream:${id}`;
        }
      }

      serializer.write(jsonrpc.success(payload.id, [...arguments.slice(1)]));
    });
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
    this.deserializer = new ControlDeserializer();
    this.serializer = new ControlSerializer();
    this._callbacks = new Map();
    this._streams = new Map();

    this.socket.on('connect', () => this.emit('ready'));
    this.socket.on('error', (err) => this.emit('error', err));
    this.deserializer.on('data', (rpc) => this._process(rpc));

    this._createInterface();
  }

  /**
   * Opens a socket connection to the control port
   * @param {number} port
   */
  connect(port) {
    this.socket.connect(port);
    this.socket.pipe(this.deserializer);
    this.serializer.pipe(this.socket);
  }

  /**
   * Processes received RPC messages from the control port
   * @private
   * @param {object} rpc
   */
  _process(rpc) {
    const { type, payload } = rpc;

    const handleResponse = () => {
      let callback = this._callbacks.get(payload.id);
      let { params } = payload;

      if (payload.params) {
        for (let p = 0; p < params.length; p++) {
          if (typeof params[p] === 'string' && params[p].includes('stream:')) {
            let [, id] = params[p].split('stream:');
            let stream = params[p] = new Readable({
              read: () => null,
              objectMode: true
            });

            stream.on('end', () => this._streams.delete(id));
            this._streams.set(id, stream);
          }
        }
        callback(null, ...payload.params);
      } else {
        callback(new Error(payload.error.message));
      }

      this._callbacks.delete(payload.id);
    };

    const handleNotification = () => {
      let [, pointer] = payload.method.split(':');
      let stream = this._streams.get(pointer);

      if (!stream) {
        return this.emit('unhandled', rpc);
      }

      payload.params.forEach((param) => stream.push(param));
    };

    if (['success', 'error'].includes(type)) {
      handleResponse();
    } else if (type === 'notification') {
      handleNotification();
    } else {
      this.emit('unhandled', rpc);
    }
  }

  /**
   * Writes the appropriate payload to the serializer
   * @private
   * @param {string} method
   * @param {array} params
   * @param {function} callback
   */
  _request(method, params, callback) {
    const id = uuid();

    this._callbacks.set(id, callback);
    this.serializer.write(jsonrpc.request(id, method, params));
  }

  /**
   * Reads the Node prototype and add sugar methods
   * @private
   */
  _createInterface() {
    const self = this;

    let proto1 = Object.getOwnPropertyNames(Node.prototype);
    let proto2 = Object.getOwnPropertyNames(
      Object.getPrototypeOf(Node.prototype)
    );
    let hidden = ['constructor', '_', 'listen'];
    let properties = proto1.concat(proto2).filter((prop) => {
      for (let i = 0; i < hidden.length; i++) {
        if (prop.includes(hidden[i])) {
          return false;
        }
      }
      return true;
    });

    properties.forEach((prop) => {
      this[prop] = function() {
        let args = [...arguments];
        let done = args.pop();

        self._request(prop, args, done);
      };
    });
  }

}

module.exports = {
  Server: ControlServer,
  Client: ControlClient,
  Deserializer: ControlDeserializer,
  Serializer: ControlSerializer
};
