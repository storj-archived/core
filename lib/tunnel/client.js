'use strict';

/**
 * Creates a tunnel connection to a {@link TunnelServer}
 * @constructor
 */
function TunnelClient() {
  if (!(this instanceof TunnelClient)) {
    return new TunnelClient();
  }
}

module.exports = TunnelClient;
