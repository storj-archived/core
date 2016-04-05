'use strict';

var inherits = require('util').inherits;
var kad = require('kad');
var natupnp = require('nat-upnp').createClient();
var ip = require('ip');
var tunnel = require('localtunnel');
var url = require('url');

/**
 * Custom HTTP transport adapter
 * @constructor
 * @param {kad.Contact}
 * @param {Object} options
 * @param {Logger} options.logger
 * @param {Boolean} options.cors
 * @param {String} options.tunnelHost
 */
function Transport(contact, options) {
  if (!(this instanceof Transport)) {
    return new Transport(contact, options);
  }

  this._tunnelhost = options.tunnelhost;
  this._noforward = options.noforward;

  kad.transports.HTTP.call(this, contact, options);
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
    if (err) {
      self._log.info('attempting to open connection tunnel...');
      return tunnel(self._contact.port, {
        subdomain: self._contact.nodeID.substr(0, 8),
        host: self._tunnelhost
      }, function(err, client) {
        if (err) {
          self._log.warn(
            'failed to tunnel connection, reason: %s', err.message
          );
          return kad.transports.HTTP.prototype._open.call(self, callback);
        }

        self._log.info('established tunnel, you are: %s', client.url);

        var addr = url.parse(client.url);
        self._tunnel = client;

        kad.transports.HTTP.prototype._open.call(self, callback);

        self._contact.address = addr.hostname;
        self._contact.port = addr.protocol === 'https:' ? 443 : 80;
      });
    }

    kad.transports.HTTP.prototype._open.call(self, callback);
    self._contact.address = ip;
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

module.exports = Transport;
