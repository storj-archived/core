'use strict';

/* eslint max-len: 0 */

const sinon = require('sinon');
const https = require('https');
const crypto = require('crypto');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const expect = require('chai').expect;
const EventEmitter = require('events').EventEmitter;
const Contract = require('../../lib/contract');
const KeyPair = require('../../lib/crypto-tools/keypair');
const FarmerInterface = require('../../lib/network/farmer');
const Network = require('../../lib/network');
const kad = require('kad');
const utils = require('../../lib/utils');
const StorageItem = require('../../lib/storage/item');
const StorageManager = require('../../lib/storage/manager');
const RAMStorageAdapter = require('../../lib/storage/adapters/ram');

const extendedKey = 'xpub6AHweYHAxk1EhJSBctQD1nLWPog6Sy2eTpKQLExR1hfzTyyZQW' +
      'vU4EYNXv1NJN7GpLYXnDLt4PzN874g6zSjAQdFCHZN7U7nbYKYVDUzD42';
const extendedKey1 = 'xpub661MyMwAqRbcGY8CLbanCCP9h8a2obgAiBgFnW3ddLuJT5ykY' +
      'TUvgLDnhqtabZinYpdUATM7CCijxFb4Yr6L595vzCZNieZShGaeoZzMmft';
const extendedKey2 = 'xpub661MyMwAqRbcEjhUPVDdfaTajUnZFozR1jwXVJtmfrNMDRmat' +
      'HCeQSMCKkWi2zvgTp18dao1qbNeTn1hxJrBgypE3p4USGoqmX135GvkCHt';

describe('FarmerInterface', function() {

  let farmer = null;
  let tmpPath = '/tmp/storj-farmer-test-' +
      crypto.randomBytes(4).toString('hex') + '/'

  beforeEach((done) => {
    mkdirp(tmpPath, done);
  });

  afterEach((done) => {
    if (farmer) {
      farmer.leave((err) => {
        if (err) {
          return done(err);
        }
        rimraf(tmpPath, done);
      });
    } else {
      done();
    }
  });

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      farmer = FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      expect(farmer).to.be.instanceOf(FarmerInterface);
    });

    it('should use the keypair address if non supplied', function() {
      var keypair = KeyPair();
      farmer = new FarmerInterface({
        keyPair: keypair,
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function() {
          return false;
        },
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      expect(farmer.getPaymentAddress()).to.equal(keypair.getAddress());
    });

  });

  describe('#_mapBridges', function() {
    it('it will create a map', function() {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      farmer.bridges = null;
      let bridges = [{
        url: 'api.storj.io',
        extendedKey: extendedKey1
      }, {
        url: 'api.eu.storj.io',
        extendedKey: extendedKey2
      }];
      farmer._mapBridges(bridges);
      expect(farmer.bridges.has(extendedKey1)).to.equal(true);
      expect(farmer.bridges.has(extendedKey2)).to.equal(true);
      expect(farmer.bridges.get(extendedKey1).url).to.eql(bridges[0].url);
      expect(farmer.bridges.get(extendedKey2).url).to.eql(bridges[1].url);
    });
  });

  describe('#_connectBridges', function() {
    it('it will cancel if already running', function() {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      farmer._connectBridgesRunning = true;
      farmer._connectBridges();
    });

    it('will call connect if bridge is not connect', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter()),
        bridges: [{
          url: 'api.storj.io',
          extendedKey: extendedKey1
        }, {
          url: 'api.eu.storj.io',
          extendedKey: extendedKey2
        }]
      });
      farmer.bridges.get(extendedKey2).connected = true;
      farmer._connectBridge = sinon.stub().callsArg(1);
      farmer.on('bridgesConnected', () => {
        expect(farmer._connectBridge.callCount).to.equal(1);
        expect(farmer._connectBridgesRunning).to.equal(false);
        farmer.bridges.get(extendedKey1).connected = true;
        farmer.bridges.get(extendedKey2).connected = true;
        done();
      });
      farmer._connectBridges();
    });
  });

  describe('#_handleContractPublication', function() {

    it('should not send an offer if negotiator returns false', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(contract, callback) {
          callback(false);
        },
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      farmer._handleContractPublication(Contract({}));
      setImmediate(function() {
        _addTo.restore();
        expect(_addTo.called).to.equal(false);
        done();
      });
    });

    it('should not send offer if cannot get farmer free space', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(contract, callback) {
          callback(false);
        },
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _size = sinon.stub(
        farmer.storageManager._storage,
        'size'
      ).callsArgWith(1, new Error('Cannot get farmer disk space'));
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      farmer._handleContractPublication(Contract({}));
      _size.restore();
      setImmediate(function() {
        expect(_addTo.called).to.equal(false);
        done();
      });
    });

    it('should not send offer if there is ' +
      'not enough free disk space', function(done) {
      //arrange
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(contract, callback) {
          callback(false);
        },
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _size = sinon.stub(
        farmer.storageManager._storage,
        'size'
      ).callsArgWith(1, null, 500, 500);
      farmer.storageManager._options.maxCapacity = 2000;
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      //execute
      farmer._handleContractPublication(Contract({}));
      //assert
      _size.restore();
      setImmediate(function() {
        expect(_addTo.called).to.equal(false);
        done();
      });
    });

    it('should add contract to pending list and negotiate', function(done) {
      var _shouldSendOffer = sinon.stub().callsArgWith(1, true);
      var _addContractToPendingList = sinon.stub();
      var _negotiateContract = sinon.stub();
      FarmerInterface.prototype._handleContractPublication.call({
        _logger: { debug: sinon.stub() },
        _shouldSendOffer: _shouldSendOffer,
        _addContractToPendingList: _addContractToPendingList,
        _negotiateContract: _negotiateContract
      }, { data_hash: utils.rmd160('') });
      setImmediate(function() {
        expect(_addContractToPendingList.called).to.equal(true);
        expect(_negotiateContract.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_removeContractFromPendingList', function() {

    it('should remove the contract from the pending list', function() {
      var _pendingList = ['testtest'];
      FarmerInterface.prototype._removeContractFromPendingList.call({
        _pendingOffers: _pendingList
      }, {
        get: sinon.stub().returns('test')
      });
      expect(_pendingList).to.have.lengthOf(0);
    });

  });

  describe('#_addContractToPendingList', function() {

    it('should not add duplicates to the list', function() {
      var ctx = { _pendingOffers: [] };
      var _test = FarmerInterface.prototype._addContractToPendingList.bind(ctx);
      var fakeContract = {
        get: sinon.stub().returns('test')
      };
      _test(fakeContract);
      expect(ctx._pendingOffers).to.have.lengthOf(1);
      _test(fakeContract);
      expect(ctx._pendingOffers).to.have.lengthOf(1);
    });

  });

  describe('#_negotiator', function() {

    it('should return false with too large shardSize', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        maxShardSize: 99 * 1024 * 1024,
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter()),
        renterWhitelist: null
      });
      farmer._negotiator(Contract({
        data_hash: utils.rmd160(' some data'),
        renter_id: utils.rmd160('nodeid'),
        data_size: 100 * 1024 * 1024
      }), function(result) {
        expect(result).to.equal(false);
        done();
      });
    });

  });

  describe('#_negotiateContract', function() {

    it('should ensure renter id is present and warn if not', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _warn = sinon.stub(farmer._logger, 'warn');
      farmer._negotiateContract(Contract({
        data_hash: utils.rmd160(' some data'),
        renter_id: null
      }));
      setImmediate(function() {
        _warn.restore();
        expect(_warn.called).to.equal(true);
        done();
      });
    });

    it('should remove contract from pending if save fails', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _remove = sinon.stub(farmer, '_removeContractFromPendingList');
      var _getContactByNodeID = sinon.stub(
        farmer.router,
        'getContactByNodeID'
      ).returns(null);
      var _save = sinon.stub(farmer.storageManager, 'save').callsArgWith(
        1,
        new Error('Save failed')
      );
      farmer._negotiateContract(Contract({
        data_hash: utils.rmd160(' some data'),
        renter_id: utils.rmd160('nodeid')
      }));
      setImmediate(function() {
        _getContactByNodeID.restore();
        _save.restore();
        _remove.restore();
        expect(_remove.called).to.equal(true);
        done();
      });
    });

    it('should remove contract from pending if lookup fails', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _save = sinon.stub(farmer.storageManager, 'save').callsArgWith(
        1,
        null
      );
      var _remove = sinon.stub(farmer, '_removeContractFromPendingList');
      var _getContactByNodeID = sinon.stub(
        farmer.router,
        'getContactByNodeID'
      ).returns(null);
      var _findNode = sinon.stub(farmer.router, 'findNode').callsArgWith(
        2,
        new Error('Lookup failed')
      );
      farmer._negotiateContract(Contract({
        data_hash: utils.rmd160('some data'),
        renter_id: utils.rmd160('nodeid')
      }));
      setImmediate(function() {
        setImmediate(function() {
          _save.restore();
          _getContactByNodeID.restore();
          _remove.restore();
          _findNode.restore();
          expect(_remove.called).to.equal(true);
          done();
        });
      });
    });

    it('should remove contract from pending if no renter', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _remove = sinon.stub(farmer, '_removeContractFromPendingList');
      var _getContactByNodeID = sinon.stub(
        farmer.router,
        'getContactByNodeID'
      ).returns(null);
      var _findNode = sinon.stub(farmer.router, 'findNode').callsArgWith(
        2,
        null,
        []
      );
      farmer._negotiateContract(Contract({
        data_hash: utils.rmd160('some data'),
        renter_id: utils.rmd160('nodeid')
      }));
      setImmediate(function() {
        setImmediate(function() {
          setImmediate(function() {
            setImmediate(function() {
              _getContactByNodeID.restore();
              _findNode.restore();
              _remove.restore();
              expect(_remove.called).to.equal(true);
              done();
            });
          });
        });
      });
    });

    it('should send offer directly to renter if locally known', function(done) {
      var kp1 = KeyPair();
      var kp2 = KeyPair();
      var contract = new Contract({
        renter_id: kp1.getNodeID(),
        farmer_id: kp2.getNodeID(),
        payment_source: kp1.getAddress(),
        payment_destination: kp2.getAddress(),
        data_hash: utils.rmd160('test')
      });
      contract.sign('renter', kp1.getPrivateKey());
      contract.sign('farmer', kp2.getPrivateKey());
      expect(contract.isComplete()).to.equal(true);
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _getContactByNodeID = sinon.stub(
        farmer.router,
        'getContactByNodeID'
      ).returns({});
      var _findNode = sinon.stub(farmer.router, 'findNode');
      var _save = sinon.stub(farmer.storageManager, 'save').callsArg(1);
      farmer._sendOfferForContract = function() {
        expect(_findNode.called).to.equal(false);
        _getContactByNodeID.restore();
        _findNode.restore();
        _save.restore();
        done();
      };
      farmer._negotiateContract(contract);
    });

  });

  describe('#join', function() {

    it('should bubble error from Network#join', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _join = sinon.stub(Network.prototype, 'join').callsArgWith(
        0,
        new Error('Failed to join network')
      );
      farmer.join(function(err) {
        _join.restore();
        expect(err.message).to.equal('Failed to join network');
        done();
      });
    });

    it('should listen for contracts before calling back', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _join = sinon.stub(Network.prototype, 'join').callsArgWith(
        0,
        null
      );
      var _listenForContracts = sinon.stub(farmer, '_listenForContracts');
      farmer.join(function() {
        _join.restore();
        _listenForContracts.restore();
        expect(_listenForContracts.called).to.equal(true);
        done();
      });
    });

  });

  describe('#noSpaceLeft', function() {
    it('will set spaceAvailable to false bridges to disconnected', function() {
      let bridges = [{
        url: 'api.storj.io',
        extendedKey: extendedKey1
      }, {
        url: 'api.eu.storj.io',
        extendedKey: extendedKey2
      }];

      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        bridges: bridges,
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      expect(farmer.spaceAvailable).to.equal(true);
      farmer.noSpaceLeft(true);
      expect(farmer.spaceAvailable).to.equal(false);
      expect(farmer.bridges.get(extendedKey1).connected).to.equal(false);
      expect(farmer.bridges.get(extendedKey2).connected).to.equal(false);
    });
  });

  describe('#connectBridges', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('will call connect bridges, and setup interval', function(done) {
      const clock = sandbox.useFakeTimers();
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      farmer._connectBridges = sinon.stub();
      farmer.connectBridges();
      expect(farmer._connectBridges.callCount).to.equal(1);
      clock.tick(FarmerInterface.CONNECT_BRIDGE_INTERVAL + 1);
      expect(farmer._connectBridges.callCount).to.equal(2);
      clearInterval(farmer._connectBridgesInterval);
      done();
    });

    it('will connect each bridge', function() {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        bridges: [
          {
            url: 'https://api.storj.io/',
            extendedKey: extendedKey
          },
          {
            url: 'https://api.eu.storj.io',
            extendedKey: extendedKey
          }
        ],
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      sandbox.stub(farmer, '_connectBridge').callsArg(1);
      farmer.connectBridges();

      let connected = 0;

      farmer.on('bridgeConnected', () => {
        connected += 1;
      });

      farmer.on('bridgesConnected', () => {
        expect(farmer._connectBridge.callCount).to.equal(2);
        expect(connected).to.equal(2);
      });
    });
  });

  describe('#_connectBridge', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('will add bridge contact if contact does not exist', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let contact = {};
      let err = new Error();
      err.statusCode = 404;
      sandbox.stub(farmer, 'bridgeRequest').callsArgWith(5, err);
      sandbox.stub(farmer, '_addBridgeContact').callsArgWith(1, null, contact);
      let bridge = {
        url: 'https://api.storj.io/',
        extendedKey: extendedKey
      }
      farmer._connectBridge(bridge, (err) => {
        if (err) {
          return done(err);
        }
        expect(farmer.bridgeRequest.callCount).to.equal(1);
        expect(farmer._addBridgeContact.callCount).to.equal(1);
        done();
      });
    });
    it('will update contact if contact exists', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let contact = {
        address: '127.0.0.1',
        port: 10
      };
      sandbox.stub(farmer, 'bridgeRequest').callsArgWith(5, null, contact);
      sandbox.stub(farmer, '_updateBridgeContact').callsArgWith(1, null);
      let bridge = {
        url: 'https://api.storj.io/',
        extendedKey: extendedKey
      }
      farmer._connectBridge(bridge, (err) => {
        if (err) {
          return done(err);
        }
        expect(farmer.bridgeRequest.callCount).to.equal(1);
        expect(farmer._updateBridgeContact.callCount).to.equal(1);
        done();
      });
    });
    it('will do nothing if contact is up-to-date', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let contact = {
        address: '127.0.0.1',
        port: 0,
        spaceAvailable: true,
        protocol: '1.2.0'
      };
      sandbox.stub(farmer, 'bridgeRequest').callsArgWith(5, null, contact);
      sandbox.stub(farmer, '_updateBridgeContact').callsArgWith(1, null);
      let bridge = {
        url: 'https://api.storj.io/',
        extendedKey: extendedKey
      }
      farmer._connectBridge(bridge, (err) => {
        if (err) {
          return done(err);
        }
        expect(farmer.bridgeRequest.callCount).to.equal(1);
        expect(farmer._updateBridgeContact.callCount).to.equal(0);
        done();
      });
    });
  });

  describe('#_addBridgeContact', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('will get and complete challenge and create contact', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let bridge = {
        url: 'https://api.storj.io/',
        extendedKey: extendedKey
      }
      let nonce = 101;
      sandbox.stub(farmer, 'bridgeRequest').callsArg(5);
      let data = {
        challenge: '5980ef806b470f147b44dc05238c53458efe9dc7f5711db6ccef2e5e832431c6',
        target: '00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      };
      farmer.bridgeRequest.onFirstCall().callsArgWith(5, null, data);
      sandbox.stub(farmer, '_completeChallenge').callsArgWith(2, null, nonce);
      farmer._addBridgeContact(bridge, (err) => {
        if (err) {
          return done(err);
        }
        expect(farmer.bridgeRequest.callCount).to.equal(2);
        expect(farmer._completeChallenge.callCount).to.equal(1);
        expect(farmer.bridgeRequest.args[1][3]['x-challenge-nonce'])
          .to.equal(101);
        done();
      });
    });
  });

  describe('#_updateBridgeContact', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('will send patch request to update contact', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 11,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let bridge = {
        url: 'https://api.storj.io/',
        extendedKey: extendedKey
      }
      sandbox.stub(farmer, 'bridgeRequest').callsArg(5);
      farmer._updateBridgeContact(bridge, (err) => {
        if (err) {
          return done(err);
        }
        expect(farmer.bridgeRequest.callCount).to.equal(1);
        expect(farmer.bridgeRequest.args[0][4].address).to.equal('127.0.0.1');
        expect(farmer.bridgeRequest.args[0][4].port).to.equal(11);
        done();
      });
    });
  });

  describe('#_completeChallenge', function() {
    it('will exec pow script and give back nonce', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      let challenge = '196c88c8907a7c6cd0d4a4cccf3ef82cef376a980217fd3bca83cba0957484b2';
      let target = '0fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      farmer._completeChallenge(challenge, target, (err, nonce) => {
        if (err) {
          return done(err);
        }
        expect(nonce).to.equal(50);
        done();
      });
    });
  });

  describe('#_getSigHash', function() {
    it('will calculate the correct sighash', function() {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let url = 'https://api.storj.io';
      let path = '/contacts?someQueryArgument=value'
      let timestamp = 1502390208007;
      let method = 'POST';
      let rawbody = '{"key": "value"}';
      let sighash = farmer._getSigHash(url, method, path, timestamp, rawbody);
      expect(sighash.toString('hex'))
        .to.equal('59146f00725c9c052ef5ec6acd63f3842728c9d191ac146668204de6ed4a648b');
    });
  });

  describe('#bridgeRequest', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('will sign and send request with response', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });

      let url = 'https://api.storj.io';
      let path = '/contacts?someQueryArgument=value'
      let method = 'POST';
      let body = {'key': 'value'};
      let headers = {};

      let res = new EventEmitter();
      res.setEncoding = sandbox.stub();

      let req = new EventEmitter();
      sandbox.stub(https, 'request').callsArgWith(1, res).returns(req);
      req.write = sandbox.stub();
      req.end = sandbox.stub();

      farmer.bridgeRequest(url, method, path, headers, body, (err, data) => {
        if (err) {
          return done(err);
        }
        expect(data).to.eql({data: 'value'});
        done();
      });

      res.emit('data', '{"data": "value"}');
      res.emit('end');
    });
  });

  describe('#_sendOfferForContract', function() {

    it('should log a warning if transport send fails', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _send = sinon.stub(farmer.transport, 'send').callsArgWith(
        2,
        new Error('Failed to send offer')
      );
      var _warn = sinon.stub(farmer._logger, 'warn');
      farmer._sendOfferForContract({
        toObject: sinon.stub(),
        get: sinon.stub()
      });
      setImmediate(function() {
        _send.restore();
        _warn.restore();
        expect(_warn.calledWith('Failed to send offer')).to.equal(true);
        done();
      });
    });

    it('should log default error if none provided', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _send = sinon.stub(farmer.transport, 'send').callsArgWith(
        2,
        null,
        { result: {} }
      );
      var _warn = sinon.stub(farmer._logger, 'warn');
      farmer._sendOfferForContract({
        toObject: sinon.stub(),
        get: sinon.stub()
      });
      setImmediate(function() {
        _send.restore();
        _warn.restore();
        expect(_warn.calledWith('Renter refused to sign')).to.equal(true);
        done();
      });
    });

    it('should call #_handleOfferRes if all good', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _send = sinon.stub(farmer.transport, 'send').callsArgWith(
        2,
        null,
        { result: { contract: {} } }
      );
      var _handleOfferRes = sinon.stub(farmer, '_handleOfferRes');
      farmer._sendOfferForContract({
        toObject: sinon.stub(),
        get: sinon.stub()
      });
      setImmediate(function() {
        _send.restore();
        expect(_handleOfferRes.called).to.equal(true);
        done();
      });
    });

  });

  describe('#_handleContractPublication', function() {

    it('should return false for invalid contract', function(done) {
      var _shouldSendOffer = sinon.stub();
      FarmerInterface.prototype._handleContractPublication.call({
        _logger: { debug: sinon.stub() },
        _shouldSendOffer: _shouldSendOffer
      }, { version: '12' });
      setImmediate(function() {
        expect(_shouldSendOffer.called).to.equal(false);
        done();
      });
    });

  });

  describe('#_handleOfferRes', function() {

    it('should stop and log error if invalid contract', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _warn = sinon.stub(farmer._logger, 'warn');
      farmer._handleOfferRes({ result: { contract: { version: '12'} } });
      setImmediate(function() {
        _warn.restore();
        expect(
          _warn.calledWith('renter responded with invalid contract')
        ).to.equal(true);
        done();
      });
    });

    it('should stop and log error if signature invalid', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _warn = sinon.stub(farmer._logger, 'warn');
      farmer._handleOfferRes({
        result: {
          contract: Contract({}).toObject()
        }
      }, new Contract());
      setImmediate(function() {
        _warn.restore();
        expect(
          _warn.calledWith('renter signature is invalid')
        ).to.equal(true);
        done();
      });
    });

    it('should create a new item if cannot load existing', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _load = sinon.stub(farmer.storageManager, 'load').callsArgWith(1, {});
      var _save = sinon.stub(farmer.storageManager, 'save');
      var _verify = sinon.stub(Contract.prototype, 'verify').returns(true);
      farmer._handleOfferRes({
        result: {
          contract: Contract({}).toObject()
        }
      }, new Contract(), {nodeID: 'nodeid'});
      setImmediate(function() {
        _load.restore();
        _save.restore();
        _verify.restore();
        expect(_save.args[0][0]).to.be.instanceOf(StorageItem);
        done();
      });
    });

    it('should reset contract count to 0 to prevent overflow', function(done) {
      farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storagePath: tmpPath,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      var _load = sinon.stub(farmer.storageManager, 'load').callsArgWith(1, {});
      var _save = sinon.stub(farmer.storageManager, 'save');
      var _verify = sinon.stub(Contract.prototype, 'verify').returns(true);
      farmer._contractCount = Number.MAX_SAFE_INTEGER;
      farmer._handleOfferRes({
        result: {
          contract: Contract({}).toObject()
        }
      }, new Contract(), {nodeID: 'nodeid'});
      setImmediate(function() {
        _load.restore();
        _save.restore();
        _verify.restore();
        expect(farmer._contractCount).to.equal(0);
        done();
      });
    });
  });

  describe('#_listenForContracts', function() {

    it('should call the #subscribe method with opcodes', function(done) {
      var _subscribe = sinon.stub().callsArg(1);
      FarmerInterface.prototype._listenForContracts.call({
        subscribe: _subscribe,
        _handleContractPublication: done
      }, []);
    });

  });


});

describe('FarmerInterface#Negotiator', function() {

  it('should callback false if no bridges', function(done) {
    FarmerInterface.Negotiator.call({
      isBridgeConnected: sinon.stub().returns(false),
      _logger: kad.Logger(0),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      }
    }, new Contract({
      data_hash: utils.rmd160(''),
      renter_id: utils.rmd160('renter')
    }), function(result) {
      expect(result).to.equal(false);
      done();
    });
  });

  it('should callback false is contract has an invalid hash', function(done) {
    FarmerInterface.Negotiator.call({
      isBridgeConnected: sinon.stub().returns(true),
      _logger: kad.Logger(0),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      }
    }, {
      get: sinon.stub().returns(null)
    }, function(result) {
      expect(result).to.equal(false);
      done();
    });
  });

  it('should return false if farmer has active transfers', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      storageManager: new StorageManager(new RAMStorageAdapter()),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 4
        }
      }
    }, new Contract({
      data_hash: utils.rmd160('')
    }), function(result) {
      expect(result).to.equal(false);
      done();
    });
  });

  it('should return true if farmer does not have the shard', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      },
      storageManager: new StorageManager(new RAMStorageAdapter())
    }, new Contract({
      data_hash: utils.rmd160('')
    }), function(result) {
      expect(result).to.equal(true);
      done();
    });
  });

  it('should callback true if we have shard for other renter', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      },
      storageManager: {
        load: sinon.stub().callsArgWith(1, null, {
          contracts: {
            otherrenter: {}
          }
        })
      }
    }, new Contract({
      data_hash: utils.rmd160(''),
      renter_id: utils.rmd160('renter')
    }), function(result) {
      expect(result).to.equal(true);
      done();
    });
  });

  it('should return true if we have a contract but no shard', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      storageManager: {
        load: sinon.stub().callsArgWith(1, null, {
          contracts: {
            '5ebef6c9f0cabf23c3565941e76fb6e5320143d3': {}
          },
          shard: { write: sinon.stub() }
        })
      },
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      }
    }, new Contract({
      data_hash: utils.rmd160(''),
      renter_id: '5ebef6c9f0cabf23c3565941e76fb6e5320143d3'
    }), function(result) {
      expect(result).to.equal(true);
      done();
    });
  });

  it('should return true if check pass and hd key used', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      _renterWhitelist: [
        'xpub6AHweYHAxk1EhJSBctQD1nLWPog6Sy2eTpKQLExR1hfzTyyZQWvU4EYNXv1NJN7' +
          'GpLYXnDLt4PzN874g6zSjAQdFCHZN7U7nbYKYVDUzD42'
      ],
      storageManager: {
        load: sinon.stub().callsArgWith(1, null, {
          contracts: {
            '5ebef6c9f0cabf23c3565941e76fb6e5320143d3': {}
          },
          shard: { write: sinon.stub() }
        })
      },
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      }
    }, new Contract({
      data_hash: utils.rmd160(''),
      renter_id: '5ebef6c9f0cabf23c3565941e76fb6e5320143d3',
      renter_hd_key: 'xpub6AHweYHAxk1EhJSBctQD1nLWPog6Sy2eTpKQLExR1hfzTyyZQ' +
        'WvU4EYNXv1NJN7GpLYXnDLt4PzN874g6zSjAQdFCHZN7U7nbYKYVDUzD42'
    }), function(result) {
      expect(result).to.equal(true);
      done();
    });
  });

  it('should return false if we have a contract and shard', function(done) {
    FarmerInterface.Negotiator.call({
      _logger: kad.Logger(0),
      isBridgeConnected: sinon.stub().returns(true),
      _offerBackoffLimit: 4,
      transport: {
        shardServer: {
          activeTransfers: 0
        }
      },
      storageManager: {
        load: sinon.stub().callsArgWith(1, null, {
          contracts: {
            '5ebef6c9f0cabf23c3565941e76fb6e5320143d3': {}
          },
          shard: { read: sinon.stub() }
        })
      }
    }, new Contract({
      data_hash: utils.rmd160(''),
      renter_id: '5ebef6c9f0cabf23c3565941e76fb6e5320143d3'
    }), function(result) {
      expect(result).to.equal(false);
      done();
    });
  });

});
