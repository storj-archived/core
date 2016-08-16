/* jshint maxstatements: false */

'use strict';

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

describe('Protocol', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(Protocol({ network: {} })).to.be.instanceOf(Protocol);
    });

  });

  describe('#_handleOffer', function() {

    it('should fail with invalid contract', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      proto._handleOffer({
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

    it('should bubble manager error', function(done) {
      var _save = sinon.stub().callsArgWith(1, new Error('Failed'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            save: _save
          },
          _pendingContracts: {
            adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: function() {}
          }
        }
      });
      var _verify = sinon.stub(proto, '_verifyContract').callsArg(2);
      proto._handleOffer({
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
          keypair: KeyPair(),
          _pendingContracts: {
            adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: function() {}
          }
        }
      });
      var contract = {
        get: sinon.stub().returns('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'),
        verify: sinon.stub().returns(false)
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
          keypair: KeyPair(),
          _pendingContracts: {
            adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: function() {}
          }
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
      var callback = utils.noop;
      callback.blacklist = ['adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'];
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          keypair: KeyPair(),
          _pendingContracts: {
            adc83b19e793491b1c6ea0fd8b46cd9f32e592fc: callback
          }
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

  });

  describe('#_handleAudit', function() {

    it('should fail if invalid audit list supplied', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0)
        }
      });
      proto._handleAudit({
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
      proto._handleAudit({
        audits: [{}],
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        _prove.restore();
        expect(err.message).to.equal('Failed');
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
          manager: {
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
          manager: {
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

  });

  describe('#_handleConsign', function() {

    it('should error if it cannot load shard item', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto._handleConsign({
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
          manager: {
            load: sinon.stub().callsArgWith(1, null, StorageItem({}))
          }
        }
      });
      proto._handleConsign({
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
          manager: {
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
      proto._handleConsign({
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
          manager: {
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
      proto._handleConsign({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#_handleRetrieve', function() {

    it('should error if it fails to load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto._handleRetrieve({
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
          manager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto._handleRetrieve({
        data_hash: 'butts'
      }, function(err) {
        expect(err.message).to.equal('Invalid data hash provided: butts');
        done();
      });
    });

  });

  describe('#_handleMirror', function() {

    it('should error if it fails to load', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            load: sinon.stub().callsArgWith(1, new Error('Failed'))
          }
        }
      });
      proto._handleMirror({}, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

    it('should error if no contract found', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          manager: {
            load: sinon.stub().callsArgWith(1, null, { contracts: {} })
          }
        }
      });
      proto._handleMirror({
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
          manager: {
            load: sinon.stub().callsArgWith(1, null, {
              contracts: {
                test: {}
              },
              shard: { read: sinon.stub() }
            })
          }
        }
      });
      proto._handleMirror({
        contact: { nodeID: 'test' }
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#_handleProbe', function() {

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
      proto._handleProbe({
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
      proto._handleProbe({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

  describe('#_handleFindTunnel', function() {

    it('should ask neighbors for tunnels if none known', function(done) {
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          router: {
            getNearestContacts: sinon.stub().returns([{}])
          },
          contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
          transport: {
            _tunserver: {
              hasTunnelAvailable: sinon.stub().returns(false)
            }
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      var _ask = sinon.stub(proto, '_askNeighborsForTunnels').callsArg(1);
      proto._handleFindTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        relayers: []
      }, function() {
        _ask.restore();
        expect(_ask.called).to.equal(true);
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
            _tunserver: {
              hasTunnelAvailable: sinon.stub().returns(false)
            }
          },
          _tunnelers: {
            getContactList: sinon.stub().returns([])
          }
        }
      });
      proto._handleFindTunnel({
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

  describe('#_handleOpenTunnel', function() {

    it('should error if it fails to open gateway', function(done) {
      var _createGateway = sinon.stub().callsArgWith(0, new Error('Failed'));
      var proto = new Protocol({
        network: {
          _logger: Logger(0),
          transport: {
            _tunserver: {
              createGateway: _createGateway
            }
          }
        }
      });
      proto._handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
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
            _tunserver: {
              createGateway: _createGateway,
              getListeningPort: sinon.stub().returns(0)
            },
            createPortMapping: _createPortMapping
          }
        }
      });
      proto._handleOpenTunnel({
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
            _tunserver: {
              createGateway: _createGateway,
              getListeningPort: sinon.stub().returns(0)
            },
            createPortMapping: _createPortMapping
          }
        }
      });
      proto._handleOpenTunnel({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' }
      }, function(err) {
        expect(err.message).to.equal('Failed');
        done();
      });
    });

  });

  describe('#_handleTrigger', function() {

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
      proto._handleTrigger({
        contact: { nodeID: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc' },
        behavior: 'test'
      }, function(err, result) {
        expect(result.message).to.equal('SUCCESS');
        done();
      });
    });

  });

});
