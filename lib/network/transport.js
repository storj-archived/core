'use strict';

var inherits = require('util').inherits;
var kad = require('kad');
var natupnp = require('nat-upnp').createClient();
var ip = require('ip');
var TunnelServer = require('../tunnel/server');

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
 */
function Transport(contact, options) {
  if (!(this instanceof Transport)) {
    return new Transport(contact, options);
  }

  this._maxTunnels = options.tunnels;
  this._tunport = options.tunport || 0;
  this._noforward = options.noforward;

  kad.transports.HTTP.call(this, contact, options);
  this._bindTunnelServer();
}

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
    return kad.transports.HTTP.prototype._open.call(self, callback);
  }

  self._log.warn(
    'you are not bound to a public address, trying traversal strategies...'
  );
  self._forwardPort(function(err, ip) {
    kad.transports.HTTP.prototype._open.call(self, callback);
    self._contact.address = ip || self._contact.address;
  });
};

/**
 * Forwards a port and resolves the public IP
 * @private
 * @param {Function} callback
 */
Transport.prototype._forwardPort = function(callback) {
  var self = this;

  natupnp.portMapping({
    public: self._contact.port,
    private: self._contact.port,
    ttl: 0
  }, function(err) {
    if (err) {
      self._log.warn('could not connect to NAT device via UPnP');
      return callback(err);
    }

    natupnp.externalIp(function(err, ip) {
      if (err) {
        self._log.warn('could not obtain public IP address');
        return callback(err);
      }

      self._log.info('successfully traversed NAT via UPnP');
      callback(null, ip);
    });
  });
};

/**
 * Set up a local tunnel server
 * @private
 */
Transport.prototype._bindTunnelServer = function() {
  this._log.info(
    'you are configured to tunnel up to %s connections',
    this._maxTunnels
  );
  this._tunserver = new TunnelServer({
    maxTunnels: this._maxTunnels,
    port: this._tunport
  });
};

module.exports = Transport;
