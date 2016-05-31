'use strict';

var inherits = require('util').inherits;
var kad = require('kad');
var portfinder = require('portfinder');
var natupnp = require('nat-upnp');
var ip = require('ip');
var TunnelServer = require('../tunnel/server');
var merge = require('merge');
var utils = require('../utils');

/**
 * Custom HTTP transport adapter
 * @constructor
 * @param {kad.Contact} contact - Contact object to binding to port
 * @param {Object}  options
 * @param {Logger}  options.logger - Logger for diagnositcs
 * @param {Boolean} options.cors - Enable cross origin resource sharing
 * @param {Number}  options.tunnels - Number of tunnels to provide to network
 * @param {Boolean} options.noforward - Do not try to punch out of NAT
 * @param {Number}  options.tunport - Port for tunnel server to listen on
 * @param {Object}  options.gateways
 * @param {Number}  options.gateways.min - Min port for gateway binding
 * @param {Number}  options.gateways.max - Max port for gateway binding
 */
function Transport(contact, options) {
  if (!(this instanceof Transport)) {
    return new Transport(contact, options);
  }

  options = merge(Object.create(Transport.DEFAULTS), options);

  this._maxTunnels = options.tunnels;
  this._tunport = options.tunport || 0;
  this._noforward = options.noforward;
  this._gateways = options.gateways;

  kad.transports.HTTP.call(this, contact, options);
  this._bindTunnelServer();
}

Transport.DEFAULTS = {
  maxTunnels: 3,
  tunport: 0,
  noforward: false,
  gateways: { min: 0, max: 0 }
};

inherits(Transport, kad.transports.HTTP);

/**
 * Opens the transport, trying UPnP to become publicly addressable and falling
 * back to using a Tunnel
 * @private
 * @param {Function} callback
 */
Transport.prototype._open = function(callback) {
  var self = this;

  if (ip.isPublic(self._contact.address) || self._noforward) {
    self._isPublic = true;
    return kad.transports.HTTP.prototype._open.call(self, callback);
  }

  self._log.warn(
    'you are not bound to a public address, trying traversal strategies...'
  );
  self._forwardPort(function(err, ip, port) {
    self._isPublic = !err;
    kad.transports.HTTP.prototype._open.call(self, callback);
    self._contact.port = port || self._contact.port;
    self._contact.address = ip || self._contact.address;
  });
};

/**
 * Creates a port mapping with UPnP
 * @param {Number} port - The port to forward
 * @param {Function} callback - Callback function
 */
Transport.prototype.createPortMapping = function(port, callback) {
  var self = this;
  var natupnpClient = natupnp.createClient();

  natupnpClient.portMapping({
    public: port,
    private: port,
    ttl: 0
  }, function(err) {
    if (err) {
      self._log.warn('could not connect to NAT device via UPnP');
      return callback(err);
    }

    natupnpClient.externalIp(function(err, ip) {
      if (err) {
        self._log.warn('could not obtain public IP address');
        return callback(err);
      }

      self._log.info('successfully traversed NAT via UPnP');
      callback(null, ip, port);
    });
  });
};

/**
 * resolve random port
 * @private
 * @param {Number}  port
 * @param {Function} callback
 */
Transport.prototype._getPort = function(callback) {
  var self = this;

  if (self._contact.port) {
    return callback(null, self._contact.port);
  }

  portfinder.basePort = Math.floor(Math.random() * (65535 - 1024) + 1024);
  portfinder.getPort(callback);
};

/**
 * Forwards a port and resolves the public IP
 * @private
 * @param {Function} callback
 */
Transport.prototype._forwardPort = function(callback) {
  var self = this;

  self._getPort(function(err, port) {
    if (err) {
      self._log.warn('could not obtain port');
      return callback(err);
    }

    self.createPortMapping(port, callback);
  });
};

/**
 * Set up a local tunnel server
 * @private
 */
Transport.prototype._bindTunnelServer = function() {
  var self = this;

  this._log.info(
    'you are configured to tunnel up to %s connections',
    this._maxTunnels || TunnelServer.DEFAULTS.maxTunnels
  );

  this._tunserver = new TunnelServer({
    maxTunnels: this._maxTunnels,
    port: this._tunport,
    portRange: this._gateways
  });

  this._tunserver.on('ready', function() {
    if (self._isPublic) {
      return;
    }

    self.createPortMapping(this.getListeningPort(), function(err, ip, port) {
      if (err) {
        self._log.error('failed to map port for tunserver: %s', err.message);
      } else {
        self._log.info('tunnel server bound and port mapped: %s', port);
      }
    });
  });
};

/**
 * Validates the supplied contact
 * @private
 */
Transport.prototype.send = function(contact, message, callback) {
  if (kad.Message.isResponse(message)) {
    return kad.transports.HTTP.prototype.send.apply(this, arguments);
  }

  if (!utils.isValidContact(contact, !!process.env.STORJ_ALLOW_LOOPBACK)) {
    return callback(new Error('Invalid or forbidden contact address'));
  }

  kad.transports.HTTP.prototype.send.apply(this, arguments);
};

module.exports = Transport;
