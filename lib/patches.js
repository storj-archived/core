'use strict';

var ms = require('ms');
var kad = require('kad');

module.exports = function() {

  // NB: Increase response timeout for RPC calls
  kad.constants.T_RESPONSETIMEOUT = ms('10s');

};
