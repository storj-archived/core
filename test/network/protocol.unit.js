/* jshint maxstatements: false */

'use strict';

var proxyquire = require('proxyquire');
var sinon = require('sinon');
var expect = require('chai').expect;
var Protocol = require('../../lib/network/protocol');
var Logger = require('kad').Logger;
var KeyPair = require('../../lib/crypto-tools/keypair');
var stream = require('readable-stream');
var constants = require('../../lib/constants');
var StorageItem = require('../../lib/storage/item');
var utils = require('../../lib/utils');
var TriggerManager = require('../../lib/sips/0003').TriggerManager;
var EventEmitter = require('events').EventEmitter;
var Contract = require('../../lib/contract');

describe('Protocol', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Protocol({ network: {} })).to.be.instanceOf(Protocol);
    });

  });

  describe('#handleOffer', function() {

    it('should queue the offer if we are waiting for one', function(done) {
      var farmerKeyPair = new KeyPair();
      var _addOfferToQueue = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          offerManager: {
            getStream: sinon.stub().returns({
              addOfferToQueue: _addOfferToQueue,
              options: { farmerBlacklist: [] }
            })
          },
          keyPair: new KeyPair(),
          listenerCount: sinon.stub().returns(0)
        }
      });
      var contract = new Contract({
        data_hash: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        renter_id: proto._network.keyPair.getNodeID(),
        farmer_id: farmerKeyPair.getNodeID(),
        payment_destination: farmerKeyPair.getAddress()
      });
      contract.sign('renter', proto._network.keyPair.getPrivateKey());
      contract.sign('farmer', farmerKeyPair.getPrivateKey());
      proto.handleOffer({
        contract: contract.toObject(),
        contact: {
          address: '127.0.0.1',
          port: 1337,
          nodeID: farmerKeyPair.getNodeID()
        }
      }, function() {
        expect(_addOfferToQueue.called).to.equal(true);
        done();
      });

    });

    it('should fail if offers are locked', function(done) {
      var farmerKeyPair = new KeyPair();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          offerManager: {
            getStream: sinon.stub().returns(null)
          },
          keyPair: new KeyPair(),
          listenerCount: sinon.stub().returns(0)
        }
      });
      var contract = new Contract({
        data_hash: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        renter_id: proto._network.keyPair.getNodeID(),
        farmer_id: farmerKeyPair.getNodeID(),
        payment_destination: farmerKeyPair.getAddress()
      });
      contract.sign('renter', proto._network.keyPair.getPrivateKey());
      contract.sign('farmer', farmerKeyPair.getPrivateKey());
      proto.handleOffer({
        contract: contract.toObject(),
        contact: {
          address: '127.0.0.1',
          port: 1337,
          nodeID: farmerKeyPair.getNodeID()
        }
      }, function(err) {
        expect(err.message).to.equal(
          'Contract no longer open to offers'
        );
        done();
      });
    });

    it('should fail with invalid contract', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      proto.handleOffer({
        contract: { version: '100' },
        contact: {
          address: '127.0.0.1',
          port: 1337,
          nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        }
      }, function(err) {
        expect(err.message).to.equal('Invalid contract format');
        done();
      });
    });

    it('should emit Network#unhandledOfferResolved', function(done) {
      var _network = new EventEmitter();
      _network._logger = Logger(0);
      _network.offerManager = {
        getStream: sinon.stub().returns(null)
      };
      var proto = new Protocol({
        network: _network
      });
      var _verify = sinon.stub(proto, '_verifyContract').callsArgWith(
        2
      );
      _network.on('unhandledOfferResolved', function(contact, contract) {
        expect(contract.get('data_hash')).to.equal(
          'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        );
        done();
      });
      setImmediate(function() {
        proto.handleOffer({
          contract: { data_hash: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          contact: {
            address: '127.0.0.1',
            port: 1337,
            nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
          }
        }, function() {
          _verify.restore();
        });
      });
    });

    it('should succeed and start consignment', function(done) {
      var _save = sinon.stub().callsArg(1);
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            save: _save
          },
          offerManager: {
            getStream: sinon.stub().returns(null)
          },
          emit: sinon.stub()
        }
      });
      var _verify = sinon.stub(proto, '_verifyContract').callsArgWith(
        2
      );
      proto.handleOffer({
        contract: { data_hash: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        contact: {
          address: '127.0.0.1',
          port: 1337,
          nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        }
      }, function(err) {
        _verify.restore();
        expect(err).to.equal(null);
        setImmediate(done);
      });
    });

    it('should bubble error from #_verifyContract', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          offerManager: { getStream: sinon.stub().returns({}) }
        }
      });
      var _verify = sinon.stub(proto, '_verifyContract').callsArgWith(
        2,
        new Error('Failed')
      );
      proto.handleOffer({
        contract: { data_hash: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        contact: {
          address: '127.0.0.1',
          port: 1337,
          nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        }
      }, function(err) {
        _verify.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#_verifyContract', function() {

    it('should fail with invalid signature', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keyPair: KeyPair(),
          offerManager: { getStream: sinon.stub().returns({}) }
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(false),
        sign: sinon.stub(),
        isComplete: sinon.stub().returns(true)
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      proto._verifyContract(contract, contact, function(err) {
        expect(err.message).to.equal('Invalid signature from farmer');
        done();
      });
    });

    it('should fail if contract incomplete', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keyPair: KeyPair(),
          offerManager: { getStream: sinon.stub().returns({}) }
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(false),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      proto._verifyContract(contract, contact, function(err) {
        expect(err.message).to.equal('Contract is not complete');
        done();
      });
    });

    it('should fail if nodeID is blacklisted', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keyPair: KeyPair(),
          offerManager: { getStream: sinon.stub().returns({
            options: {
              farmerBlacklist: ['adc83b19e793491b1c6ea0fd8b46cd9f32e592fc']
            }
          }) }
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(true),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      proto._verifyContract(contract, contact, function(err) {
        expect(err.message).to.equal('Contract no longer open to offers');
        done();
      });
    });

    it('should fail if unhandled', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keyPair: KeyPair(),
          emit: sinon.stub(),
          offerManager: { getStream: sinon.stub().returns(null) },
          listenerCount: sinon.stub().returns(0)
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(true),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      proto._verifyContract(contract, contact, function(err) {
        expect(err.message).to.equal('Contract no longer open to offers');
        done();
      });
    });

    it('should emit unhandled offer', function(done) {
      var network = new EventEmitter();
      network._logger = Logger(0);
      network.keyPair = KeyPair();
      network.offerManager = { getStream: sinon.stub().returns(null) };
      var proto = new Protocol({
        network: network
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(true),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      network.on('unhandledOffer', function(contact, contract, didResolve) {
        didResolve();
      });
      setImmediate(function() {
        proto._verifyContract(contract, contact, function() {
          done();
        });
      });
    });

    it('should emit an unhandled offer if we are listening', function(done) {
      var _network = new EventEmitter();
      _network._logger = Logger(0);
      _network.keyPair = KeyPair();
      _network.offerManager = { getStream: sinon.stub().returns({
        options: { farmerBlacklist: [] }
      }) };
      var proto = new Protocol({
        network: _network
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(true),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      _network.on('unhandledOffer', function(contract, contact, resolver) {
        resolver(null);
      });
      proto._verifyContract(contract, contact, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should succeed and callback without error', function(done) {
      var pendingCb = function() {};
      pendingCb.blacklist = [];
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keyPair: KeyPair(),
          offerManager: { getStream: sinon.stub().returns({
            options: { farmerBlacklist: [] }
          }) }
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(true),
        isComplete: sinon.stub().returns(true),
        sign: sinon.stub()
      };
      var contact = {
        address: '127.0.0.1',
        port: 1337,
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      };
      proto._verifyContract(contract, contact, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#handleAudit', function() {

    it('should fail if invalid audit list supplied', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      proto.handleAudit({
        audits: null,
        contact: { nodeID: '' }
      }, function(err) {
        expect(err.message).to.equal('Invalid audit list supplied');
        done();
      });
    });

    it('should error if fail to prove shard', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      var _prove = sinon.stub(proto, '_proveShardExistence').callsArgWith(
        3,
        new Error('Failed')
      );
      proto.handleAudit({
        audits: [{}],
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        _prove.restore();
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should prove shard existence', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      var _prove = sinon.stub(proto, '_proveShardExistence').callsArgWith(
        3,
        null,
        'PROOF'
      );
      proto.handleAudit({
        audits: [{}],
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err, result) {
        _prove.restore();
        expect(result.proofs[0]).to.equal('PROOF');
        done();
      });
    });

  });

  describe('#_proveShardExistence', function() {

    it('should fail if invalid args supplied', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            load: sinon.stub()
          }
        }
      });
      proto._proveShardExistence(null, null, '', function(err) {
        expect(err.message).to.equal('Invalid data hash or challenge provided');
        done();
      });
    });

    it('should fail if manager cannot load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto._proveShardExistence(true, true, '', function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should fail if stream is not readable', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              shard: new stream.Writable()
            })
          }
        }
      });
      proto._proveShardExistence(true, true, '', function(err) {
        expect(err.message).to.equal('Shard not found');
        done();
      });
    });

    it('should create the storage proof and return it', function(done) {
      var e = new stream.Writable({ write: utils.noop });
      var StubbedProtocol = proxyquire('../../lib/network/protocol', {
        '../audit-tools/proof-stream': function() {
          e.getProofResult = sinon.stub().returns('PROOF RESULT');
          return e;
        }
      });
      var proto = new StubbedProtocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: function(key, cb) {
              cb(null, {
                shard: new stream.Readable({ read: utils.noop }),
                trees: {
                  id: []
                }
              });
              setImmediate(function() {
                e.emit('finish');
              });
            }
          }
        }
      });
      proto._proveShardExistence(true, true, 'id', function(err, result) {
        expect(result).to.equal('PROOF RESULT');
        done();
      });
    });

    it('should return an error if the shard proving fails', function(done) {
      var e = new stream.Writable({ write: utils.noop });
      var StubbedProtocol = proxyquire('../../lib/network/protocol', {
        '../audit-tools/proof-stream': function() {
          e.getProofResult = sinon.stub().returns('PROOF RESULT');
          return e;
        }
      });
      var proto = new StubbedProtocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: function(key, cb) {
              cb(null, {
                shard: new stream.Readable({ read: utils.noop }),
                trees: {
                  id: []
                }
              });
              setImmediate(function() {
                e.emit('error', new Error('Failed'));
              });
            }
          }
        }
      });
      proto._proveShardExistence(true, true, 'id', function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });

    });

  });

  describe('#handleConsign', function() {

    it('should error if it cannot load shard item', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto.handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should error if the contract is for different nodeid', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, StorageItem({}))
          }
        }
      });
      proto.handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Consignment is not authorized');
        done();
      });
    });

    it('should error if the consign is early or late', function(done) {
      var contracts = {
        adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: {
          get: function(key) {
            if (key === 'renter_id') {
              return 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc';
            } else if (key === 'store_begin') {
              return Date.now() + 200 + constants.CONSIGN_THRESHOLD;
            } else {
              return Date.now() + 400 + constants.CONSIGN_THRESHOLD;
            }
          }
        }
      };
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: contracts,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          }
        }
      });
      proto.handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal(
          'Consignment violates contract store time'
        );
        done();
      });
    });

    it('should error if it fails to save', function(done) {
      var contracts = {
        adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: {
          get: function(key) {
            if (key === 'renter_id') {
              return 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc';
            } else if (key === 'store_begin') {
              return Date.now() - 100;
            } else {
              return Date.now() + 100;
            }
          }
        }
      };
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: contracts,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            }),
            save: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto.handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should accept the consignment and issue a token', function(done) {
      var contracts = {
        adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: {
          get: function(key) {
            if (key === 'renter_id') {
              return 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc';
            } else if (key === 'store_begin') {
              return Date.now() - 100;
            } else {
              return Date.now() + 100;
            }
          }
        }
      };
      var _accept = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: contracts,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            }),
            save: sinon.stub().callsArgWith(1, null)
          },
          transport: {
            shardServer: { accept: _accept }
          }
        }
      });
      proto.handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err, result) {
        expect(typeof result.token).to.equal('string');
        expect(_accept.called).to.equal(true);
        done();
      });
    });

  });

  describe('#handleRetrieve', function() {

    it('should error if it fails to load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto.handleRetrieve({
        data_hash: utils.rmd160('')
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should error if invalid key', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto.handleRetrieve({
        data_hash: 'butts'
      }, function(err) {
        expect(err.message).to.equal('Invalid data hash provided: butts');
        done();
      });
    });

    it('should error with unauthorized contact', function() {
      var proto = new Protocol({
        network: {
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              getContract: function() {
                return false;
              }
            })
          }
        }
      });
      proto.handleRetrieve({
        data_hash: utils.rmd160(''),
        contact: {}
      }, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('Retrieval is not authorized');
      });
    });

    it('should issue a datachannel token', function(done) {
      var contracts = {
        nodeid: {}
      };
      var _accept = sinon.stub();
      var proto = new Protocol({
        network: {
          transport: {
            shardServer: { accept: _accept }
          },
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              shard: {},
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          },
        }
      });
      proto.handleRetrieve({
        data_hash: utils.rmd160(''),
        contact: { nodeID: 'nodeid' }
      }, function(err, result) {
        if (err) {
          return done(err);
        }
        expect(typeof result.token).to.equal('string');
        expect(_accept.called).to.equal(true);
        done();
      });
    });

    it('should fail if data is not readable', function(done) {
      var contracts = {
        nodeid: {}
      };
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              shard: {
                write: sinon.stub()
              },
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          }
        }
      });
      proto.handleRetrieve({
        data_hash: utils.rmd160(''),
        contact: { nodeID: 'nodeid' }
      }, function(err) {
        expect(err.message).to.equal('Shard data not found');
        done();
      });

    });

  });

  describe('#handleMirror', function() {

    var Protocol = proxyquire('../../lib/network/protocol', {
      '../bridge-client': sinon.stub().returns({
        createExchangeReport: sinon.stub()
      })
    });

    it('should error if it fails to load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          }
        }
      });
      proto.handleMirror({
        contact: { address: '0.0.0.0', port: 4321, nodeID: 'nodeid' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should error if no contract found', function(done) {
      var contracts = {};
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: {},
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: 'test' }
      }, function(err) {
        expect(err.message).to.equal('No contract found for shard');
        done();
      });
    });

    it('should callback immediately if shard already exists', function(done) {
      var contracts = {
        test: {}
      };
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: contracts,
              shard: { read: sinon.stub() },
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: 'test' }
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should start downloading shard and destroy on failure', function(done) {
      var download = new stream.Readable({ read: () => null });
      var Protocol = proxyquire('../../lib/network/protocol', {
        '../utils': {
          createShardDownloader: sinon.stub().returns(download)
        }
      });
      var contracts = {
        test: {}
      };
      var shard = new stream.Writable({ write: () => null });
      shard.destroy = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: contracts,
              shard: shard,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          },
          bridgeClient: {
            createExchangeReport: sinon.stub()
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: 'test' },
        farmer: {
          address: '0.0.0.0',
          port: 1234,
          nodeID: utils.rmd160('')
        },
        data_hash: 'hash'
      }, function(err) {
        expect(err).to.equal(null);
        download.emit('error', new Error());
        setImmediate(() => {
          expect(shard.destroy.called).to.equal(true);
          done();
        });
      });
    });

    it('should start downloading and destroy on bad hash', function(done) {
      var download = new stream.Readable({
        read: function() {
          if (!this.called) {
            this.called = true;
            this.push('hello world');
          } else {
            this.push(null);
          }
        }
      });
      var Protocol = proxyquire('../../lib/network/protocol', {
        '../utils': {
          createShardDownloader: sinon.stub().returns(download)
        }
      });
      var contracts = {
        test: {}
      };
      var shard = new stream.Writable({ write: (a, b, c) => c() });
      shard.destroy = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: contracts,
              shard: shard,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              }
            })
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          },
          bridgeClient: {
            createExchangeReport: sinon.stub()
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: 'test' },
        farmer: {
          address: '0.0.0.0',
          port: 1234,
          nodeID: utils.rmd160('')
        },
        data_hash: 'hash'
      }, function(err) {
        expect(err).to.equal(null);
        setImmediate(() => {
          expect(shard.destroy.called).to.equal(true);
          done();
        });
      });
    });

    it('should start downloading shard and report on success', function(done) {
      var download = new stream.Readable({
        read: function() {
          if (!this.called) {
            this.called = true;
            this.push('hello world');
          } else {
            this.push(null);
          }
        }
      });
      var createExchangeReport = sinon.stub();
      var Protocol = proxyquire('../../lib/network/protocol', {
        '../utils': {
          createShardDownloader: sinon.stub().returns(download)
        }
      });
      var contracts = {
        test: {}
      };
      var shard = new stream.Writable({ write: (a, b, c) => c() });
      shard.destroy = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: contracts,
              shard: shard,
              getContract: function(contact) {
                return contracts[contact.nodeID];
              },
              hash: 'd7d5ee7824ff93f94c3055af9382c86c68b5ca92'
            })
          },
          bridgeClient: {
            createExchangeReport: createExchangeReport
          },
          contact: {
            address: '0.0.0.0',
            port: 1234,
            nodeID: 'nodeid'
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: 'test' },
        farmer: {
          address: '0.0.0.0',
          port: 1234,
          nodeID: utils.rmd160('')
        },
        data_hash: 'd7d5ee7824ff93f94c3055af9382c86c68b5ca92'
      }, function(err) {
        expect(err).to.equal(null);
        setImmediate(() => {
          expect(createExchangeReport.called).to.equal(true);
          done();
        });
      });
    });

  });

  describe('#handleProbe', function() {

    it('should respond with an error if probe fails', function(done) {
      var _send = sinon.stub().callsArgWith(2, new Error('ECONNREFUSED'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          transport: {
            send: _send
          }
        }
      });
      proto.handleProbe({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Probe failed, you are not addressable');
        done();
      });
    });

    it('should respond with no error if probe succeeds', function(done) {
      var _send = sinon.stub().callsArgWith(2, null);
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          transport: {
            send: _send
          }
        }
      });
      proto.handleProbe({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#handleFindTunnel', function() {

    it('should ask neighbors for tunnels if none known', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            tunnelServer: {
              _proxies: {},
              _opts: { maxProxiesAllowed: 0 }
            }
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      var _ask = sinon.stub(proto, '_askNeighborsForTunnels').callsArg(1);
      proto.handleFindTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        relayers: []
      }, function() {
        _ask.restore();
        expect(_ask.called).to.equal(true);
        done();
      });
    });

    it('should return the known tunnelers', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            tunnelServer: {
              _proxies: {},
              _opts: { maxProxiesAllowed: 3 }
            }
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      proto.handleFindTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        relayers: []
      }, function(err, result) {
        expect(result.tunnels).to.have.lengthOf(1);
        done();
      });

    });

    it('should not ask neighbors if max relays reached', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            tunnelServer: {
              _proxies: {},
              _opts: { maxProxiesAllowed: 0 }
            }
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      proto.handleFindTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        relayers: [
          'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
          'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
        ]
      }, function(err, result) {
        expect(result.tunnels).to.have.lengthOf(0);
        done();
      });
    });

  });

  describe('#_askNeighborsForTunnels', function() {
    const sandbox = sinon.sandbox.create();
    afterEach(() => sandbox.restore());

    it('should skip adding tunnels if error response', function(done) {
      var _forEach = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: sinon.stub().callsArgWith(2, new Error('Failed'), {
              result: {
                tunnels: { forEach: _forEach }
              }
            })
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      proto._askNeighborsForTunnels([], function() {
        expect(_forEach.called).to.equal(false);
        done();
      });
    });

    it('should skip adding tunnels if bad format response', function(done) {
      var _forEach = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: sinon.stub().callsArgWith(2, null, {
              result: {
                tunnels: { forEach: _forEach }
              }
            })
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      proto._askNeighborsForTunnels([], function() {
        expect(_forEach.called).to.equal(false);
        done();
      });
    });

    it('should skip adding tunnels if bucket is full', function(done) {
      var _addContact = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: sinon.stub().callsArgWith(2, null, {
              result: {
                tunnels: [
                  { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
                ]
              }
            })
          },
          _tunnelers: {
            addContact: _addContact,
            getContactList: sinon.stub().returns([]),
            getSize: sinon.stub().returns(20)
          }
        }
      });
      proto._askNeighborsForTunnels([], function() {
        expect(_addContact.called).to.equal(false);
        done();
      });
    });

    it('should stop requesting if response was given', function(done) {
      var _addContact = sinon.stub();
      var send = sinon.stub().callsArgWith(2, null, {
        result: {
          tunnels: [
            {
              address: '0.0.0.0',
              port: 1234,
              nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
            }
          ]
        }
      });
      send.onFirstCall().callsArgWith(2, new Error('Failed'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}, {}, {}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: send
          },
          _tunnelers: {
            addContact: _addContact,
            getContactList: sinon.stub().returns([]),
            getSize: sinon.stub().returns(19)
          }
        }
      });
      proto._askNeighborsForTunnels([], function() {
        expect(send.callCount).to.equal(2);
        expect(_addContact.called).to.equal(true);
        done();
      });
    });

    it('should adding tunnels if bucket is not full', function(done) {
      var _addContact = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: sinon.stub().callsArgWith(2, null, {
              result: {
                tunnels: [
                  {
                    address: '0.0.0.0',
                    port: 1234,
                    nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                  }
                ]
              }
            })
          },
          _tunnelers: {
            addContact: _addContact,
            getContactList: sinon.stub().returns([]),
            getSize: sinon.stub().returns(19)
          }
        }
      });
      proto._askNeighborsForTunnels([], function() {
        expect(_addContact.called).to.equal(true);
        done();
      });
    });

    it('should respond with no tunnels if none found', function(done) {
      var _addContact = sinon.stub();
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            send: sinon.stub().callsArgWith(2, null, {
              result: {
                tunnels: []
              }
            })
          },
          _tunnelers: {
            addContact: _addContact,
            getContactList: sinon.stub().returns([]),
            getSize: sinon.stub().returns(19)
          }
        }
      });
      proto._askNeighborsForTunnels([], function(err, result) {
        expect(_addContact.called).to.equal(false);
        expect(result.tunnels).to.have.lengthOf(0);
        done();
      });
    });

  });

  describe('#handleOpenTunnel', function() {

    it('should error if it fails to open gateway', function(done) {
      var _addProxy = sinon.stub().callsArgWith(1, new Error('Failed'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          transport: {
            tunnelServer: {
              addProxy: _addProxy
            }
          }
        }
      });
      proto.handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should not try to create a port mapping if public', function(done) {
      var _createPortMapping = sinon.stub().callsArg(1);
      var _addProxy = sinon.stub().callsArgWith(1, null, {
        getProxyPort: sinon.stub().returns(8080)
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: false,
            _isPublic: true,
            tunnelServer: {
              addProxy: _addProxy
            },
            createPortMapping: _createPortMapping
          }
        }
      });
      proto.handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function() {
        expect(_createPortMapping.called).to.equal(false);
        done();
      });
    });

    it('should try to create a port mapping if private', function(done) {
      var _createPortMapping = sinon.stub().callsArg(1);
      var _addProxy = sinon.stub().callsArgWith(1, null, {
        getProxyPort: sinon.stub().returns(8080)
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: true,
            _isPublic: true,
            tunnelServer: {
              addProxy: _addProxy
            },
            createPortMapping: _createPortMapping
          }
        }
      });
      proto.handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function() {
        expect(_createPortMapping.called).to.equal(true);
        done();
      });
    });

    it('should error if port mapping fails', function(done) {
      var _createPortMapping = sinon.stub().callsArgWith(
        1,
        new Error('Failed')
      );
      var _addProxy = sinon.stub().callsArgWith(1, null, {
        getProxyPort: sinon.stub().returns(8080)
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: true,
            _isPublic: true,
            tunnelServer: {
              addProxy: _addProxy
            },
            createPortMapping: _createPortMapping
          }
        }
      });
      proto.handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#handleTrigger', function() {

    it('should call TriggerManager#process', function(done) {
      var triggers = new TriggerManager();
      triggers.add('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc', {
        test: function(params, reply, destroy) {
          reply(null, { message: 'SUCCESS' });
          destroy();
        }
      });
      var proto = new Protocol({
        network: {
          triggers: triggers
        }
      });
      proto.handleTrigger({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        behavior: 'test'
      }, function(err, result) {
        expect(result.message).to.equal('SUCCESS');
        done();
      });
    });

  });

  describe('#handleRenew', function() {

    it('should fail with no renter_id', function(done) {
      var proto = new Protocol({
        network: {}
      });
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('No original renter_id was supplied');
        done();
      });
    });

    it('should fail with no renter_signature', function(done) {
      var proto = new Protocol({
        network: {}
      });
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }, function(err) {
        expect(err.message).to.equal(
          'No original renter signature supplied'
        );
        done();
      });
    });

    it('should fail if bad original renter signature', function(done) {
      var proto = new Protocol({
        network: {}
      });
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        renter_signature: 'iamasignature'
      }, function(err) {
        expect(err.message).to.equal(
          'Invalid original renter signature on updated contract'
        );
        done();
      });
    });

    it('should fail if bad updated signature', function(done) {
      var proto = new Protocol({
        network: {}
      });
      var renterKp = new KeyPair();
      var badKp = new KeyPair();
      var contract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      contract.sign('renter', badKp.getPrivateKey());
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: contract.signExternal(renterKp.getPrivateKey()),
        contract: contract.toObject()
      }, function(err) {
        expect(err.message).to.equal(
          'Invalid new renter signature on updated contract'
        );
        done();
      });
    });

    it('should fail if storage manager cannot load item', function(done) {
      var proto = new Protocol({
        network: {
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Not found'))
          }
        }
      });
      var renterKp = new KeyPair();
      var contract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      contract.sign('renter', renterKp.getPrivateKey());
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: contract.signExternal(renterKp.getPrivateKey()),
        contract: contract.toObject()
      }, function(err) {
        expect(err.message).to.equal('Not found');
        done();
      });
    });

    it('should fail if no contract for the original renter', function(done) {
      var renterKp = new KeyPair();
      var oldContract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      oldContract.sign('renter', renterKp.getPrivateKey());
      var item = new StorageItem({ hash: utils.rmd160('') });
      item.addContract({
        nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }, oldContract);
      var proto = new Protocol({
        network: {
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, item)
          }
        }
      });
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: oldContract.signExternal(renterKp.getPrivateKey()),
        contract: oldContract.toObject()
      }, function(err) {
        expect(err.message).to.equal('No contract found for renter_id');
        done();
      });
    });

    it('should fail if contract is modified illegally', function(done) {
      var renterKp = new KeyPair();
      var oldContract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      oldContract.sign('renter', renterKp.getPrivateKey());
      var item = new StorageItem({ hash: utils.rmd160('') });
      item.addContract({
        nodeID: renterKp.getNodeID()
      }, oldContract);
      var proto = new Protocol({
        network: {
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, item)
          }
        }
      });
      var newContract = new Contract(oldContract.toObject());
      newContract.set('payment_destination', renterKp.getAddress());
      newContract.sign('renter', renterKp.getPrivateKey());
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: newContract.signExternal(renterKp.getPrivateKey()),
        contract: newContract.toObject()
      }, function(err) {
        expect(err.message).to.equal('payment_destination cannot be changed');
        done();
      });
    });

    it('should fail if manager cannot save updated item', function(done) {
      var renterKp = new KeyPair();
      var oldContract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      oldContract.sign('renter', renterKp.getPrivateKey());
      var item = new StorageItem({ hash: utils.rmd160('') });
      item.addContract({
        nodeID: renterKp.getNodeID()
      }, oldContract);
      var proto = new Protocol({
        network: {
          keyPair: new KeyPair(),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, item),
            save: sinon.stub().callsArgWith(1, new Error('Cannot save'))
          }
        }
      });
      var newContract = new Contract(oldContract.toObject());
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: newContract.signExternal(renterKp.getPrivateKey()),
        contract: newContract.toObject()
      }, function(err) {
        expect(err.message).to.equal('Failed to save updated contract');
        done();
      });
    });

    it('should succeed with signed updated contract', function(done) {
      var renterKp = new KeyPair();
      var oldContract = new Contract({
        data_hash: utils.rmd160(''),
        renter_id: renterKp.getNodeID()
      });
      var farmerKp = new KeyPair();
      oldContract.sign('renter', renterKp.getPrivateKey());
      var item = new StorageItem({ hash: utils.rmd160('') });
      item.addContract({
        nodeID: renterKp.getNodeID()
      }, oldContract);
      var proto = new Protocol({
        network: {
          keyPair: farmerKp,
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, item),
            save: sinon.stub().callsArg(1)
          }
        }
      });
      var newContract = new Contract(oldContract.toObject());
      proto.handleRenew({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        renter_id: renterKp.getNodeID(),
        renter_signature: newContract.signExternal(renterKp.getPrivateKey()),
        contract: newContract.toObject()
      }, function(err, result) {
        expect(
          Contract.compare(Contract(result.contract), newContract)
        ).to.equal(true);
        done();
      });
    });

  });

});
