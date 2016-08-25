#!/usr/bin/env node

'use strict';

var program = require('commander');
var fs = require('fs');
var platform = require('os').platform();
var path = require('path');
var prompt = require('prompt');
var colors = require('colors/safe');
var storj = require('..');
var merge = require('merge');
var log = require('./logger')().log;
var utils = require('./utils');
var actions = require('./index');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
var DATADIR = path.join(HOME, '.storjcli');

if (!storj.utils.existsSync(DATADIR)) {
  fs.mkdirSync(DATADIR);
}

prompt.message = colors.bold.cyan(' [...]');
prompt.delimiter = colors.cyan('  > ');

program.version(require('../package').version);
program.option('-u, --url <url>', 'set the base url for the api');
program.option('-k, --keypass <password>', 'unlock keyring without prompt');

function PrivateClient(options) {
  return storj.BridgeClient(program.url, merge({
    keypair: utils.loadKeyPair(),
    logger: log
  }, options));
}

function PublicClient() {
  return storj.BridgeClient(program.url, { logger: log });
}

function getKeyPass() {
  return program.keypass || process.env.STORJ_KEYPASS || null;
}

var ACTIONS = {
  getinfo: function getInfo() {
    actions.account.getInfo(PublicClient());
  },
  register: function register() {
    actions.account.register(PublicClient());
  },
  login: function login() {
    actions.account.login(program.url);
  },
  logout: function logout() {
    actions.account.logout(PrivateClient());
  },
  resetpassword: function resetpassword(email) {
    actions.account.resetpassword(PublicClient(), email);
  },
  listkeys: function listkeys() {
    actions.keys.list(PrivateClient());
  },
  addkey: function addkey(pubkey) {
    actions.keys.add(PrivateClient(), pubkey);
  },
  removekey: function removekey(pubkey, env) {
    actions.keys.remove(PrivateClient(), pubkey, env);
  },
  listbuckets: function listbuckets() {
    actions.buckets.list(PrivateClient());
  },
  getbucket: function showbucket(id) {
    actions.buckets.get(PrivateClient(), id);
  },
  removebucket: function removebucket(id, env) {
    actions.buckets.remove(PrivateClient(), id, env);
  },
  addbucket: function addbucket(name, storage, transfer) {
    actions.buckets.add(PrivateClient(), name, storage, transfer);
  },
  updatebucket: function updatebucket(id, name, storage, transfer) {
    actions.buckets.update(PrivateClient(), id, name, storage, transfer);
  },
  listfiles: function listfiles(bucketid) {
    actions.files.list(PrivateClient(), bucketid);
  },
  removefile: function removefile(id, fileId, env) {
    actions.files.remove(PrivateClient(), getKeyPass(), id, fileId, env);
  },
  uploadfile: function uploadfile(bucket, filepath, env) {
    var privateClient = PrivateClient({
      concurrency: env.concurrency ? parseInt(env.concurrency) : 6
    });

    var filepaths = process.argv.slice();
    var firstFileIndex = filepaths.indexOf(filepath);

    filepaths.splice(0,firstFileIndex);

    actions.files.upload(privateClient, getKeyPass(), bucket, filepaths, env);
  },
  createmirrors: function createmirrors(bucket, file, env) {
    actions.files.mirror(PrivateClient(), bucket, file, env);
  },
  getpointers: function getpointers(bucket, id, env) {
    actions.files.getpointers(PrivateClient(), bucket, id, env);
  },
  addframe: function addframe() {
    actions.frames.add(PrivateClient());
  },
  listframes: function listframes() {
    actions.frames.list(PrivateClient());
  },
  getframe: function getframe(frame) {
    actions.frames.get(PrivateClient(), frame);
  },
  removeframe: function removeframe(frame, env) {
    actions.frames.remove(PrivateClient(), frame, env);
  },
  downloadfile: function downloadfile(bucket, id, filepath, env) {
    actions.files.download(
      PrivateClient(),
      getKeyPass(),
      bucket,
      id,
      filepath,
      env
    );
  },
  createtoken: function createtoken(bucket, operation) {
    PrivateClient().createToken(bucket, operation, function(err, token) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Token successfully created.');
      log(
        'info',
        'Token: %s, Bucket: %s, Operation: %s',
        [token.token, token.bucket, token.operation]
      );
    });
  },
  streamfile: function streamfile(bucket, id, env) {
    var privateClient = PrivateClient({
      logger: storj.deps.kad.Logger(0)
    });
    actions.files.stream(privateClient, getKeyPass(), bucket, id, env);
  },
  resetkeyring: function resetkeyring() {
    utils.resetkeyring(getKeyPass());
  },
  listcontacts: function listcontacts(page) {
    actions.contacts.list(PublicClient(), page);
  },
  getcontact: function getcontact(nodeid) {
    actions.contacts.get(PublicClient(), nodeid);

  },
  generatekey: function generatekey(env) {
    utils.generatekey(env);
  },
  signmessage: function signmessage(privatekey, message) {
    utils.signmessage(privatekey, message, this.compact);
  },
  prepareaudits: function prepareaudits(num, filepath) {
    utils.prepareaudits(num, filepath);
  },
  provefile: function provefile(leaves, challenge, filepath) {
    utils.provefile(leaves, challenge, filepath);
  },
  verifyproof: function verifyproof(root, depth, resp) {
    utils.verifyproof(root, depth, resp);
  },
  exportkeyring: function(directory) {
    utils.exportkeyring(getKeyPass(), directory);
  },
  importkeyring: function(path) {
    utils.importkeyring(getKeyPass(), path);
  },
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
  .action(ACTIONS.getinfo);

program
  .command('register')
  .description('register a new account with the storj api')
  .action(ACTIONS.register);

program
  .command('login')
  .description('authorize this device to access your storj api account')
  .action(ACTIONS.login);

program
  .command('logout')
  .description('revoke this device\'s access your storj api account')
  .action(ACTIONS.logout);

program
  .command('reset-password <email>')
  .description('request an account password reset email')
  .action(ACTIONS.resetpassword);

program
  .command('list-keys')
  .description('list your registered public keys')
  .action(ACTIONS.listkeys);

program
  .command('add-key <pubkey>')
  .description('register the given public key')
  .action(ACTIONS.addkey);

program
  .command('remove-key <pubkey>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('invalidates the registered public key')
  .action(ACTIONS.removekey);

program
  .command('list-buckets')
  .description('list your storage buckets')
  .action(ACTIONS.listbuckets);

program
  .command('get-bucket <bucket-id>')
  .description('get specific storage bucket information')
  .action(ACTIONS.getbucket);

program
  .command('add-bucket [name] [storage] [transfer]')
  .description('create a new storage bucket')
  .action(ACTIONS.addbucket);

program
  .command('remove-bucket <bucket-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('destroys a specific storage bucket')
  .action(ACTIONS.removebucket);

program
  .command('update-bucket <bucket-id> [name] [storage] [transfer]')
  .description('updates a specific storage bucket')
  .action(ACTIONS.updatebucket);

program
  .command('add-frame')
  .description('creates a new file staging frame')
  .action(ACTIONS.addframe);

program
  .command('list-frames')
  .description('lists your file staging frames')
  .action(ACTIONS.listframes);

program
  .command('get-frame <frame-id>')
  .description('retreives the file staging frame by id')
  .action(ACTIONS.getframe);

program
  .command('remove-frame <frame-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('removes the file staging frame by id')
  .action(ACTIONS.removeframe);

program
  .command('export-keyring <directory>')
  .description('compresses and exports keyring to specific directory')
  .action(ACTIONS.exportkeyring);

program
  .command('import-keyring <path>')
  .description('imports keyring tarball into current keyring')
  .action(ACTIONS.importkeyring);

program
  .command('list-files <bucket-id>')
  .description('list the files in a specific storage bucket')
  .action(ACTIONS.listfiles);

program
  .command('remove-file <bucket-id> <file-id>')
  .option('-f, --force', 'skip confirmation prompt')
  .description('delete a file pointer from a specific bucket')
  .action(ACTIONS.removefile);

program
  .command('upload-file <bucket-id> <filepath>')
  .option('-c, --concurrency <count>', 'max shard upload concurrency')
  .option('-C, --fileconcurrency <count>', 'max file upload concurrency', 1)
  .option('-r, --redundancy <mirrors>', 'number of mirrors to create for file')
  .description('upload a file to the network and track in a bucket')
  .action(ACTIONS.uploadfile);

program
  .command('create-mirrors <bucket-id> <file-id>')
  .option('-r, --redundancy [mirrors]', 'mirrors to create for file', 3)
  .description('create redundant mirrors for the given file')
  .action(ACTIONS.createmirrors);

program
  .command('download-file <bucket-id> <file-id> <filepath>')
  .option('-x, --exclude <nodeID,nodeID...>', 'mirrors to create for file', '')
  .description('download a file from the network with a pointer from a bucket')
  .action(ACTIONS.downloadfile);

program
  .command('generate-key')
  .option('-s, --save <path>', 'save the generated private key')
  .option('-e, --encrypt <passphrase>', 'encrypt the generated private key')
  .description('generate a new ecdsa key pair and print it')
  .action(ACTIONS.generatekey);

program
  .command('get-contact <nodeid>')
  .description('get the contact information for a given node id')
  .action(ACTIONS.getcontact);

program
  .command('get-pointers <bucket-id> <file-id>')
  .option('-s, --skip <index>', 'starting index for file slice', 0)
  .option('-n, --limit <number>', 'total pointers to return from index', 6)
  .description('get pointers metadata for a file in a bucket')
  .action(ACTIONS.getpointers);

program
  .command('create-token <bucket-id> <operation>')
  .description('create a push or pull token for a file')
  .action(ACTIONS.getfile);

program
  .command('list-contacts [page]')
  .option('-c, --connected', 'limit results to connected nodes')
  .description('list the peers known to the remote bridge')
  .action(ACTIONS.listcontacts);

program
  .command('prepare-audits <total> <filepath>')
  .description('generates a series of challenges used to prove file possession')
  .action(ACTIONS.prepareaudits);

program
  .command('prove-file <merkleleaves> <challenge> <filepath>')
  .description('generates a proof from the comma-delimited tree and challenge')
  .action(ACTIONS.provefile);

program
  .command('reset-keyring')
  .description('reset the keyring password')
  .action(ACTIONS.resetkeyring);

program
  .command('sign-message <privatekey> <message>')
  .option('-c, --compact', 'use bitcoin-style compact signature')
  .description('signs the message using the supplied private key')
  .action(ACTIONS.signmessage);

program
  .command('stream-file <bucket-id> <file-id>')
  .option('-x, --exclude <nodeID,nodeID...>', 'mirrors to create for file', '')
  .description('stream a file from the network and write to stdout')
  .action(ACTIONS.streamfile);

program
  .command('verify-proof <root> <depth> <proof>')
  .description('verifies the proof response given the merkle root and depth')
  .action(ACTIONS.verifyproof);

program
  .command('*')
  .description('prints the usage information to the console')
  .action(ACTIONS.fallthrough);

program.parse(process.argv);

// Awwwww <3
if (process.argv.length < 3) {
  return program.help();
}
