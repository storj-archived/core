/**
 * @module storj
 * @license AGPL-3.0
 */

'use strict';

const { spawn } = require('child_process');
const { join } = require('path');


/**
 * Forks a child storjd process and returns the child process and a controller
 * client for sending commands to it
 * @function
 * @param {object|string} config - Configuration properties as object or path
 * to a configuration file. See {@tutorial config} for details.
 * connect to the control port
 * @returns {object}
 */
/* istanbul ignore next */
module.exports = function(config = {}) {
  /* eslint max-statements: [2, 18] */
  const cport = config.ControlPort || require('./bin/_config').ControlPort;
  const caddr = config.ControlPort || require('./bin/_config').ControlHostname;
  const controller = new module.exports.control.Client();

  let envs = {};
  let args = [join(__dirname, './bin/storjd.js')];
  let trys = 10;
  let opts = { env: envs };

  if (typeof config === 'string') {
    args = args.concat(['--config', config]);
  } else {
    for (let prop in config) {
      envs[`storjd_${prop}`] = config[prop];
    }
  }

  const child = spawn(process.execPath, args, opts);

  function connect() {
    controller.once('error', () => {
      controller.removeAllListeners();
      if (trys !== 0) {
        trys--;
        setTimeout(connect, 1000);
      }
    });
    controller.on('ready', () => controller.removeAllListeners('error'));
    controller.connect(cport, caddr);
  }

  process.on('exit', () => child.kill());
  child.stdout.once('data', () => setTimeout(() => connect(), 1000));
  child.stderr.once('data', (msg) => child.emit('error', new Error(msg)));

  return { child, controller };
};

/** {@link Node} */
module.exports.Node = require('./lib/node');

/** {@link Rules} */
module.exports.Rules = require('./lib/rules');

/** {@link Transport} */
module.exports.Transport = require('./lib/transport');

/** {@link Server} */
module.exports.Server = require('./lib/server');

/** {@link Audit} */
module.exports.Audit = require('./lib/audit');

/** {@link Proof} */
module.exports.Proof = require('./lib/proof');

/** {@link Offers} */
module.exports.Offers = require('./lib/offers');

/** {@link Contract} */
module.exports.Contract = require('./lib/contract');

/** {@link module:storjd/constants} */
module.exports.constants = require('./lib/constants');

/** {@link module:storjd/utils} */
module.exports.utils = require('./lib/utils');

/** {@link module:storjd/version} */
module.exports.version = require('./lib/version');

/** @see https://github.com/bookchin/boscar */
module.exports.control = require('boscar');
