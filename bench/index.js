'use strict';

const maxTime = 10;
const benchmark = require('benchmark');

const crypto = require('crypto');
const suite = new benchmark.Suite();
const HDKey = require('hdkey');
const storj = require('..');

const seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4d' +
    'd015834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103b' +
    'ce8af';
const masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
const hdKey = masterKey.derive('m/3000\'/0\'');
const publicExtendedKey = hdKey.publicExtendedKey;
const renterKey = storj.KeyPair(
  hdKey.deriveChild(12).privateKey.toString('hex')
);
const renterID = renterKey.getNodeID();
const farmerKey = storj.KeyPair();
const farmerID = farmerKey.getNodeID();
const sourceAddress = renterKey.getAddress();
const farmerAddress = farmerKey.getAddress();
const dataHash = crypto.createHash('rmd160').update('test').digest('hex');

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

suite.add('new hd contract', newHDContract, {maxTime: maxTime});
suite.add('new contract', newContract, {maxTime: maxTime});

suite.on('cycle', function(event) {
  console.log(String(event.target));
}).on('complete', function() {
  console.log('Done');
}).run();
