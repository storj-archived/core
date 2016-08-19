'use strict';
var colors = require('colors/safe');

function Logger() {
  if (!(this instanceof Logger)) {
    return new Logger();
  }

  var self = this;

  this.log._logger = function() {
    var type = arguments[0];
    var message = arguments[1];
    var values = Array.prototype.slice.call(arguments, 2);

    self.log(type, message, values);
  };

  this.log.info = this.log._logger.bind(null, 'info');
  this.log.debug = this.log._logger.bind(null, 'debug');
  this.log.warn = this.log._logger.bind(null, 'warn');
  this.log.error = this.log._logger.bind(null, 'error');

}

Logger.prototype.log = function(type, message, args) {
  switch (type) {
    case 'debug':
      message = colors.bold.magenta(' [debug]  ') + message;
      break;
    case 'info':
      message = colors.bold.cyan(' [info]   ') + message;
      break;
    case 'warn':
      message = colors.bold.yellow(' [warn]   ') + message;
      break;
    case 'error':
      message = colors.bold.red(' [error]  ') + message;
      break;
  }

  message = colors.bold.gray(' [' + new Date() + ']') + message;
  console.log.apply(console, [message].concat(args || []));
};

module.exports = Logger;
