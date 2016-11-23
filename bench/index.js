'use strict';

const maxTime = 10;
const benchmark = require('benchmark');

const assert = require('assert');
const crypto = require('crypto');
const suite = new benchmark.Suite();
const HDKey = require('hdkey');
const storj = require('..');
const kad = require('kad');
const RAMStorageAdapter = require('../lib/storage/adapters/ram');

const seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
    'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
    'ce8af';
const masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
const hdKey = masterKey.derive('m/3000\'/0\'');
const publicExtendedKey = hdKey.publicExtendedKey;
const renterKey = storj.KeyPair(
  hdKey.deriveChild(12).privateKey.toString('hex')
);
const renterPrivateKey = renterKey.getPrivateKey();
const renterID = renterKey.getNodeID();
const farmerKey = storj.KeyPair();
const farmerID = farmerKey.getNodeID();
const sourceAddress = renterKey.getAddress();
const farmerAddress = farmerKey.getAddress();
const dataHash = crypto.createHash('rmd160').update('test').digest('hex');

// Increase the nonce expiration
storj.constants.NONCE_EXPIRE = 1000000;

var hdContract;
function newHDContract() {
  hdContract = storj.Contract({
    renter_hd_key: publicExtendedKey,
    renter_hd_index: 12,
    renter_id: renterID,
    farmer_id: farmerID,
    payment_source: sourceAddress,
    payment_destination: farmerAddress,
    data_hash: dataHash
  });
}

var contract;
function newContract() {
  contract = storj.Contract({
    renter_id: renterID,
    farmer_id: farmerID,
    payment_source: sourceAddress,
    payment_destination: farmerAddress,
    data_hash: dataHash
  });
}

var net = new storj.Network({
  keyPair: renterKey,
  storageManager: storj.StorageManager(RAMStorageAdapter()),
  logger: kad.Logger(0),
});

var contract1 = new storj.Contract();
contract1.set('data_hash', dataHash);
contract1.set('renter_hd_key', publicExtendedKey);
contract1.set('renter_hd_index', 12);
contract1.sign('renter', renterPrivateKey);

var contact1 = storj.Contact({
  hdKey: hdKey.privateExtendedKey,
  hdIndex: 12,
  address: '10.0.0.0',
  port: 1337,
  nodeID: renterID
});

var message = new kad.Message({
  method: 'RETRIEVE',
  params: {
    data_hash: contract1.get('data_hash'),
    contact: contact1
  }
});

net._signMessage(message, function(err){
  if (err) {
    throw err;
  }
});

function verifyHDContact(deferred) {
  net._verifyMessage(message, contact1, function(err) {
    assert.equal(err, null);
    deferred.resolve();
  });
}

var contact2 = storj.Contact({
  address: '10.0.0.0',
  port: 1337,
  nodeID: renterID
});

function verifyContact(deferred) {
  net._verifyMessage(message, contact2, function(err) {
    assert.equal(err, null);
    deferred.resolve();
  });
}

suite.add('new hd contract', newHDContract, {maxTime: maxTime});
suite.add('new contract', newContract, {maxTime: maxTime});
suite.add('verify message with hd contact', verifyHDContact, {
  maxTime: maxTime,
  defer: true
});
suite.add('verify message with contact', verifyContact, {
  maxTime: maxTime,
  defer: true
});

suite.on('cycle', function(event) {
  console.log(String(event.target));
}).on('complete', function() {
  console.log('Done');
  process.exit(0);
}).run();
