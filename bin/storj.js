#!/usr/bin/env node

'use strict';

var program = require('commander');
var fs = require('fs');
var platform = require('os').platform();
var path = require('path');
var prompt = require('prompt');
var colors = require('colors/safe');
var storj = require('storj');
var merge = require('merge');
var logger = require('./logger');
var log = logger().log;
var utils = require('./utils');
var actions = require('./index');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
var DATADIR = path.join(HOME, '.storjcli');

if (!storj.utils.existsSync(DATADIR)) {
  fs.mkdirSync(DATADIR);
}

prompt.message = colors.bold.cyan(' [...]');
prompt.delimiter = colors.cyan('  > ');
program._storj = {};

program.version(require('../package').version);
program.option('-u, --url <url>', 'set the base url for the api');
program.option('-k, --keypass <password>', 'unlock keyring without prompt');
program.option('-d, --debug', 'display debug data', 4);

program._storj.loglevel = function() {
  return program.debug || 3;
};

program._storj.PrivateClient = function(options) {
  if (typeof options === 'undefined') {
    options = {};
  }
  options.blacklistFolder = DATADIR;

  return storj.BridgeClient(program.url, merge({
    keypair: utils.loadKeyPair(),
    logger: logger(program._storj.loglevel()).log
  }, options));
};

program._storj.PublicClient = function() {
  return storj.BridgeClient(
    program.url,
    { logger: logger(program._storj.loglevel()).log }
  );
};

program._storj.getKeyPass = function() {
  return program.keypass || process.env.STORJ_KEYPASS || null;
};

var ACTIONS = {
  fallthrough: function(command) {
    log(
      'error',
      'Unknown command "%s", please use --help for assistance',
      command
    );
    program.help();
  }
};

program
  .command('get-info')
  .description('get remote api information')
  .action(actions.account.getInfo.bind(program));

program
  .command('register')
  .description('register a new account with the storj api')
  .action(actions.account.register.bind(program));

program
  .command('login')
  .description('authorize this device to access your storj api account')
  .action(actions.account.login.bind(null, program.url));

program
  .command('logout')
  .description('revoke this device\'s access your storj api account')
  .action(actions.account.logout.bind(program));

program
  .command('reset-password <email>')
  .description('request an account password reset email')
  .action(actions.account.resetpassword.bind(program));

program
  .command('list-keys')
  .description('list your registered public keys')
  .action(actions.keys.list.bind(program));

program
  .command('add-key <pubkey>')
  .description('register the given public key')
  .action(actions.keys.add.bind(program));

program
  .command('remove-key <pubkey>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('invalidates the registered public key')
  .action(actions.keys.remove.bind(program));

program
  .command('list-buckets')
  .description('list your storage buckets')
  .action(actions.buckets.list.bind(program));

program
  .command('get-bucket <bucket-id>')
  .description('get specific storage bucket information')
  .action(actions.buckets.get.bind(program));

program
  .command('add-bucket [name] [storage] [transfer]')
  .description('create a new storage bucket')
  .action(actions.buckets.add.bind(program));

program
  .command('remove-bucket <bucket-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('destroys a specific storage bucket')
  .action(actions.buckets.remove.bind(program));

program
  .command('update-bucket <bucket-id> [name] [storage] [transfer]')
  .description('updates a specific storage bucket')
  .action(actions.buckets.update.bind(program));

program
  .command('add-frame')
  .description('creates a new file staging frame')
  .action(actions.frames.add.bind(program));

program
  .command('list-frames')
  .description('lists your file staging frames')
  .action(actions.frames.list.bind(program));

program
  .command('get-frame <frame-id>')
  .description('retreives the file staging frame by id')
  .action(actions.frames.get.bind(program));

program
  .command('remove-frame <frame-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('removes the file staging frame by id')
  .action(actions.frames.remove.bind(program));

program
  .command('export-keyring <directory>')
  .description('compresses and exports keyring to specific directory')
  .action(utils.exportkeyring.bind(program));

program
  .command('import-keyring <path>')
  .description('imports keyring tarball into current keyring')
  .action(utils.importkeyring.bind(program));

program
  .command('list-files <bucket-id>')
  .description('list the files in a specific storage bucket')
  .action(actions.files.list.bind(program));

program
  .command('remove-file <bucket-id> <file-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('delete a file pointer from a specific bucket')
  .action(actions.files.remove.bind(program));

program
  .command('upload-file <bucket-id> <filepath>')
  .option('-c, --concurrency <count>', 'max shard upload concurrency')
  .option('-C, --fileconcurrency <count>', 'max file upload concurrency', 1)
  .option('-r, --redundancy <mirrors>', 'number of mirrors to create for file')
  .description('upload a file or files to the network and track in a bucket.' +
               '\n  upload all files in a single directory using "/path/*"\n' +
               '  or upload recursively using "/path/**/*".\n' +
               '  <filepath> can be a path with wildcard or a space separated' +
               ' list of files.'
             )
  .action(actions.files.upload.bind(program));

program
  .command('create-mirrors <bucket-id> <file-id>')
  .option('-r, --redundancy [mirrors]', 'mirrors to create for file', 3)
  .description('create redundant mirrors for the given file')
  .action(actions.files.mirror.bind(program));

program
  .command('download-file <bucket-id> <file-id> <filepath>')
  .option('-x, --exclude <nodeID,nodeID...>', 'mirrors to create for file', '')
  .description('download a file from the network with a pointer from a bucket')
  .action(actions.files.download.bind(program));

program
  .command('generate-key')
  .option('-s, --save <path>', 'save the generated private key')
  .option('-e, --encrypt <passphrase>', 'encrypt the generated private key')
  .description('generate a new ecdsa key pair and print it')
  .action(utils.generatekey.bind(program));

program
  .command('get-contact <nodeid>')
  .description('get the contact information for a given node id')
  .action(actions.contacts.get.bind(program));

program
  .command('get-pointers <bucket-id> <file-id>')
  .option('-s, --skip <index>', 'starting index for file slice', 0)
  .option('-n, --limit <number>', 'total pointers to return from index', 6)
  .description('get pointers metadata for a file in a bucket')
  .action(actions.files.getpointers.bind(program));

program
  .command('create-token <bucket-id> <operation>')
  .description('create a push or pull token for a file')
  .action(actions.buckets.createtoken.bind(program));

program
  .command('list-contacts [page]')
  .option('-c, --connected', 'limit results to connected nodes')
  .description('list the peers known to the remote bridge')
  .action(actions.contacts.list.bind(program));

program
  .command('prepare-audits <total> <filepath>')
  .description('generates a series of challenges used to prove file possession')
  .action(utils.prepareaudits.bind(program));

program
  .command('prove-file <merkleleaves> <challenge> <filepath>')
  .description('generates a proof from the comma-delimited tree and challenge')
  .action(utils.provefile.bind(program));

program
  .command('change-keyring')
  .description('change the keyring password')
  .action(utils.changekeyring.bind(program));

  program
    .command('reset-keyring')
    .description('delete the current keyring and start a new one')
    .action(utils.resetkeyring.bind(program));

program
  .command('sign-message <privatekey> <message>')
  .option('-c, --compact', 'use bitcoin-style compact signature')
  .description('signs the message using the supplied private key')
  .action(utils.signmessage.bind(program));

program
  .command('stream-file <bucket-id> <file-id>')
  .option('-x, --exclude <nodeID,nodeID...>', 'mirrors to create for file', '')
  .description('stream a file from the network and write to stdout')
  .action(actions.files.stream.bind(program));

program
  .command('verify-proof <root> <depth> <proof>')
  .description('verifies the proof response given the merkle root and depth')
  .action(utils.verifyproof.bind(program));

program
  .command('*')
  .description('prints the usage information to the console')
  .action(ACTIONS.fallthrough);

program.parse(process.argv);

// Awwwww <3
if (process.argv.length < 3) {
  return program.help();
}
