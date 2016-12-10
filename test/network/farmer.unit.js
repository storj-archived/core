'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/crypto-tools/keypair');
var FarmerInterface = require('../../lib/network/farmer');
var Network = require('../../lib/network');
var kad = require('kad');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');
var StorageItem = require('../../lib/storage/item');
var StorageManager = require('../../lib/storage/manager');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var EventEmitter = require('events').EventEmitter;
var CLEANUP = [];

describe('FarmerInterface', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      var farmer = FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      expect(farmer).to.be.instanceOf(FarmerInterface);
    });

    it('should use the keypair address if non supplied', function() {
      var keypair = KeyPair();
      var farmer = new FarmerInterface({
        keyPair: keypair,
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function() {
          return false;
        },
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      expect(farmer.getPaymentAddress()).to.equal(keypair.getAddress());
    });

    it('should use the renterWhitelist if provided', function() {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        renterWhitelist: ['somerenterid'],
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      expect(farmer._renterWhitelist[0]).to.equal('somerenterid');
    });

  });

  describe('#_handleContractPublication', function() {

    it('should not send an offer if negotiator returns false', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(contract, callback) {
          callback(false);
        },
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      farmer._handleContractPublication(Contract({}));
      setImmediate(function() {
        _addTo.restore();
        expect(_addTo.called).to.equal(false);
        done();
      });
    });

    it('should not send offer if cannot get farmer free space', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(contract, callback) {
          callback(false);
        },
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var _size = sinon.stub(
        farmer.storageManager._storage,
        'size'
      ).callsArgWith(0, new Error('Cannot get farmer disk space'));
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      farmer._handleContractPublication(Contract({}));
      _size.restore();
      setImmediate(function() {
        expect(_addTo.called).to.equal(false);
        done();
      });
    });

    it('should not send an offer if concurrency is exceeded', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        contractNegotiator: function(c, callback) {
          callback(true);
        },
        logger: kad.Logger(0),
        maxOfferConcurrency: 0,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var _addTo = sinon.stub(farmer, '_addContractToPendingList');
      farmer._handleContractPublication(Contract({}));
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

  describe('#_negotiateContract', function() {

    it('should ask network for renter if not locally known', function(done) {
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var _getContactByNodeID = sinon.stub(
        farmer.router,
        'getContactByNodeID'
      ).returns(null);
      var _findNode = sinon.stub(
        farmer.router,
        'findNode'
      ).callsArgWith(2, null, [Contact({
        address: '127.0.0.1',
        port: 1234,
        nodeID: kp1.getNodeID()
      })]);
      var _save = sinon.stub(farmer.storageManager, 'save').callsArg(1);
      farmer._sendOfferForContract = function() {
        expect(_findNode.called).to.equal(true);
        _getContactByNodeID.restore();
        _findNode.restore();
        _save.restore();
        done();
      };
      farmer._negotiateContract(contract);
    });

    it('should ensure renter id is present and warn if not', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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

  describe('#_sendOfferForContract', function() {

    it('should log a warning if transport send fails', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
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

  describe('#_listenForCapacityChanges', function() {

    it('should set the free space to true', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var manager = new EventEmitter();
      farmer._listenForCapacityChanges(manager);
      manager.emit('unlocked');
      setImmediate(function() {
        expect(farmer._hasFreeSpace).to.equal(true);
        done();
      });
    });

    it('should set the free space to false', function(done) {
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: kad.Logger(0),
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var manager = new EventEmitter();
      farmer._listenForCapacityChanges(manager);
      manager.emit('locked');
      setImmediate(function() {
        expect(farmer._hasFreeSpace).to.equal(false);
        done();
      });
    });

    it('should log the error', function(done) {
      var logger = kad.Logger(0);
      var _warn = sinon.stub(logger, 'warn');
      var farmer = new FarmerInterface({
        keyPair: KeyPair(),
        rpcPort: 0,
        tunnelServerPort: 0,
        doNotTraverseNat: true,
        logger: logger,
        storageManager: new StorageManager(new RAMStorageAdapter())
      });
      CLEANUP.push(farmer);
      var manager = new EventEmitter();
      farmer._listenForCapacityChanges(manager);
      manager.emit('error', new Error('Failed'));
      setImmediate(function() {
        expect(_warn.called).to.equal(true);
        done();
      });
    });

  });

  after(function() {
    CLEANUP.forEach(function(farmer) {
      if (farmer.node) {
        farmer.leave();
      }
    });
  });

});

describe('FarmerInterface#Negotiator', function() {

  it('should callback false is renter is not in whitelist', function(done) {
    FarmerInterface.Negotiator.call({
      _renterWhitelist: [utils.rmd160('someotherrenter')],
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
      _renterWhitelist: null,
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
