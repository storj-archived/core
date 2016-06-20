'use strict';

var ms = require('ms');
var kad = require('kad');
var constants = require('./constants');

module.exports = function() {

  // NB: Increase response timeout for RPC calls
  kad.constants.T_RESPONSETIMEOUT = constants.RPC_TIMEOUT;

};
