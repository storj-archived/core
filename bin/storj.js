#!/usr/bin/env node

'use strict';

var crypto = require('crypto');
var base58 = require('bs58');
var fs = require('fs');
var path = require('path');
var program = require('commander');
var storj = require('..');
var platform = require('os').platform();
var prompt = require('prompt');
var url = require('url');
var colors = require('colors/safe');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USER_PROFILE;
var DEFAULTS = {
  verbosity: 3,
  datadir: path.join(HOME, '.storjnode'),
  address: '127.0.0.1',
  port: 4000,
  farmer: false,
  seed: 'storj://api.metadisk.org:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052'
};
var CONFNAME = 'config.json';

prompt.message = colors.white.bold(' :STORJ:');
prompt.delimiter = colors.blue(' >> ');

program
  .version(storj.version)
  .option(
    '-d, --datadir [path]',
    'Set configuration and storage path',
    DEFAULTS.datadir
  )
  .option(
    '-p, --password [password]',
    'Password to unlock your private key',
    ''
  )
  .parse(process.argv);

var schema = {
  properties: {
    address: {
      description: 'Enter your public hostname or IP address',
      required: true,
      default: DEFAULTS.address
    },
    port: {
      description: 'Enter the port number the service should use',
      required: true,
      message: 'Port number must be between 1 and 65535',
      type: 'number',
      default: DEFAULTS.port,
      conform: function(value) {
        return (value > 0) && (value <= 65535);
      }
    },
    verbosity: {
      description: 'Enter the level of verbosity for the logs (0-4)',
      required: true,
      type: 'number',
      message: 'Verbosity must be between 0 and 4',
      default: DEFAULTS.verbosity,
      conform: function(value) {
        return [0, 1, 2, 3, 4].indexOf(value) !== -1;
      }
    },
    farmer: {
      description: 'Accept storage contracts from the network? (true/false)',
      type: 'boolean',
      default: false,
      message: 'Must enter "true" or "false"'
    },
    seed: {
      description: 'Enter the URI of a known seed',
      required: false,
      default: DEFAULTS.seed,
      message: 'Invalid seed URI supplied, make sure the nodeID is correct',
      conform: function(value) {
        var parsed = url.parse(value);
        var proto = parsed.protocol === 'storj:';
        var nodeid = parsed.path.substr(1).length === 40;
        var address = parsed.hostname && parsed.port;

        return proto && nodeid && address;
      }
    },
    datadir: {
      description: 'Enter the path to store configuration and data',
      required: true,
      default: DEFAULTS.datadir,
      message: 'Directory already exists, refusing to overwrite',
      conform: function(value) {
        if (fs.existsSync(value)) {
          return false;
        }
        fs.mkdirSync(value);
        return true;
      }
    },
    keypath: {
      description: 'Enter the path to store your encrypted private key',
      required: true,
      default: path.join(DEFAULTS.datadir, 'id_ecdsa'),
      message: 'Cannot write key to path that does not exist',
      conform: function(value) {
        return fs.existsSync(path.dirname(value));
      }
    },
    password: {
      description: 'Enter a password to protect your private key',
      hidden: true,
      replace: '*',
      required: true
    }
  }
};

var keypass = {
  properties: {
    password: {
      description: 'Unlock your private key to start storj',
      hidden: true,
      replace: '*',
      required: true
    }
  }
};

function encrypt(password, str) {
  var aes256 = crypto.createCipher('aes-256-cbc', password);
  var a = aes256.update(str, 'utf8');
  var b = aes256.final();
  var buf = new Buffer(a.length + b.length);

  a.copy(buf, 0);
  b.copy(buf, a.length);

  return base58.encode(buf);
}

function decrypt(password, str) {
  var aes256 = crypto.createDecipher('aes-256-cbc', password);
  var a = aes256.update(new Buffer(base58.decode(str)));
  var b = aes256.final();
  var buf = new Buffer(a.length + b.length);

  a.copy(buf, 0);
  b.copy(buf, a.length);

  return buf.toString('utf8');
}

function start(datadir) {
  if (!fs.existsSync(datadir)) {
    return console.log('The supplied datadir does not exist');
  }

  if (!fs.existsSync(path.join(datadir, CONFNAME))) {
    return console.log('No storj configuration found in datadir');
  }

  var config = JSON.parse(
    fs.readFileSync(path.join(datadir, CONFNAME)).toString()
  );
  var privkey = fs.readFileSync(config.keypath).toString();

  function open(passwd, privkey) {
    try {
      privkey = decrypt(passwd, privkey);
    } catch (err) {
      console.log('Failed to unlock private key - incorrect password');
      process.exit();
    }

    var network = storj.Network({
      keypair: storj.KeyPair(privkey),
      manager: storj.Manager(storj.FSStorageAdapter(datadir)),
      loglevel: config.loglevel,
      seeds: config.seeds,
      datadir: datadir,
      contact: {
        address: config.address,
        port: config.port,
      },
      farmer: config.farmer
    });

    network.join(function(err) {
      if (err) {
        console.log(err);
        process.exit();
      }
    });
  }

  if (program.password) {
    open(program.password, privkey);
  } else {
    prompt.start();
    prompt.get(keypass, function(err, result) {
      if (err) {
        return console.log(err);
      }

      open(result.password, privkey);
    });
  }
}

if (!fs.existsSync(program.datadir)) {
  console.log('\n Let\'s setup your Storj configuration!\n');

  prompt.start();

  prompt.get(schema, function(err, result) {
    if (err) {
      return console.log(err);
    }

    var config = {
      address: result.address,
      port: result.port,
      seeds: [result.seed],
      farmer: result.farmer,
      loglevel: result.verbosity,
      keypath: result.keypath
    };

    fs.writeFileSync(
      path.join(result.datadir, CONFNAME),
      JSON.stringify(config, null, 2)
    );

    fs.writeFileSync(
      config.keypath,
      encrypt(result.password, storj.KeyPair().getPrivateKey())
    );

    start(result.datadir);
  });
} else {
  start(program.datadir);
}
