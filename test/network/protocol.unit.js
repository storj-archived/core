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
var rs = require('readable-stream');
var ReadableStream = rs.Readable;
var WritableStream = rs.Writable;
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
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: {
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
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: {
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
      var _accept = sinon.stub();
      var proto = new Protocol({
        network: {
          dataChannelServer: {
            accept: _accept
          },
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              trees: {
                adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: null
              },
              contracts: {
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
              }
            }),
            save: sinon.stub().callsArgWith(1, null)
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

    it('should issue a datachannel token', function(done) {
      var _accept = sinon.stub();
      var proto = new Protocol({
        network: {
          dataChannelServer: {
            accept: _accept
          },
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, { shard: {} })
          }
        }
      });
      proto.handleRetrieve({
        data_hash: utils.rmd160(''),
        contact: { nodeID: 'nodeid' }
      }, function(err, result) {
        expect(typeof result.token).to.equal('string');
        expect(_accept.called).to.equal(true);
        done();
      });
    });

    it('should fail if data is not readable', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, { shard: {
              write: sinon.stub()
            } })
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

    it('should error if it fails to load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto.handleMirror({}, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should callback with error if channel cannot open', function(done) {
      var dcx = new EventEmitter();
      dcx.createReadStream = function() {
        return new ReadableStream({ read: utils.noop });
      };
      var StubbedProtocol = proxyquire('../../lib/network/protocol', {
        '../data-channels/client': function() {
          return dcx;
        }
      });
      var proto = new StubbedProtocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: function(hash, callback) {
              callback(null, {
                contracts: {
                  '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83': {}
                },
                shard: new WritableStream({ write: utils.noop })
              });
              setImmediate(function() {
                dcx.emit('error', new Error('Failed to open channel'));
              });
            }
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83' },
        data_hash: '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83'
      }, function(err) {
        expect(err.message).to.equal('Failed to open channel');
        done();
      });
    });

    it('should error if no contract found', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, { contracts: {} })
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
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: {
                test: {}
              },
              shard: { read: sinon.stub() }
            })
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

    it('should open the channel and destroy a failed shard', function(done) {
      var dcx = new EventEmitter();
      var _rs = new ReadableStream({ read: utils.noop });
      dcx.createReadStream = function() {
        return _rs;
      };
      var StubbedProtocol = proxyquire('../../lib/network/protocol', {
        '../data-channels/client': function() {
          return dcx;
        }
      });
      var _shard = new WritableStream({ write: utils.noop });
      _shard.destroy = sinon.stub();
      var proto = new StubbedProtocol({
        network: {
          _logger: Logger(0),
          storageManager: {
            load: function(hash, callback) {
              callback(null, {
                contracts: {
                  '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83': {}
                },
                shard: _shard
              });
              setImmediate(function() {
                dcx.emit('open');
                setImmediate(function() {
                  _rs.emit('error', new Error('Failed'));
                });
              });
            }
          }
        }
      });
      proto.handleMirror({
        contact: { nodeID: '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83' },
        data_hash: '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83'
      }, function(err) {
        expect(err).to.equal(null);
        setTimeout(function() {
          expect(_shard.destroy.called).to.equal(true);
          done();
        }, 10);
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
              hasTunnelAvailable: sinon.stub().returns(false)
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
              hasTunnelAvailable: sinon.stub().returns(true)
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
              hasTunnelAvailable: sinon.stub().returns(false)
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
            _createContact: sinon.stub(),
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
            _createContact: sinon.stub(),
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
      var _createGateway = sinon.stub().callsArgWith(0, new Error('Failed'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          transport: {
            tunnelServer: {
              createGateway: _createGateway
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
      var _createGateway = sinon.stub().callsArgWith(0, null, {
        getEntranceToken: function() {
          return 'sometoken';
        },
        getEntranceAddress: function() {
          return { address: '0.0.0.0', port: 0 };
        }
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: false,
            _isPublic: true,
            tunnelServer: {
              createGateway: _createGateway,
              getListeningPort: sinon.stub().returns(0)
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
      var _createGateway = sinon.stub().callsArgWith(0, null, {
        getEntranceToken: function() {
          return 'sometoken';
        },
        getEntranceAddress: function() {
          return { address: '0.0.0.0', port: 0 };
        }
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: true,
            _isPublic: true,
            tunnelServer: {
              createGateway: _createGateway,
              getListeningPort: sinon.stub().returns(0)
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
      var _createGateway = sinon.stub().callsArgWith(0, null, {
        getEntranceToken: function() {
          return 'sometoken';
        },
        getEntranceAddress: function() {
          return { address: '0.0.0.0', port: 0 };
        }
      });
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          contact: {},
          transport: {
            _requiresTraversal: true,
            _isPublic: true,
            tunnelServer: {
              createGateway: _createGateway,
              getListeningPort: sinon.stub().returns(0)
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

});
