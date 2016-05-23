'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Contract = require('../../lib/contract');
var KeyPair = require('../../lib/keypair');
var FarmerInterface = require('../../lib/interfaces/farmer');
var kad = require('kad');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');

describe('FarmerInterface', function() {

  describe('#_handleContractPublication', function() {

    it('should not send an offer if the negotiator returns false', function() {
      var farmer = new FarmerInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        negotiator: function() {
          return false;
        },
        logger: kad.Logger(0),
        backend: require('memdown')
      });
      expect(farmer._handleContractPublication(Contract({}))).to.equal(false);
    });

    it('should not send an offer if concurrency is exceeded', function() {
      var farmer = new FarmerInterface({
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        negotiator: function() {
          return true;
        },
        logger: kad.Logger(0),
        backend: require('memdown'),
        concurrency: 0
      });
      expect(farmer._handleContractPublication(Contract({}))).to.equal(false);
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
        keypair: KeyPair(),
        port: 0,
        noforward: true,
        logger: kad.Logger(0),
        backend: require('memdown'),
        storage: { path: 'test' }
      });
      var _getContactByNodeID = sinon.stub(
        farmer._router,
        'getContactByNodeID'
      ).returns(null);
      var _findNode = sinon.stub(
        farmer._router,
        'findNode'
      ).callsArgWith(1, null, [Contact({
        address: '127.0.0.1',
        port: 1234,
        nodeID: kp1.getNodeID()
      })]);
      var _save = sinon.stub(farmer._manager, 'save').callsArg(1);
      farmer._sendOfferForContract = function() {
        expect(_findNode.called).to.equal(true);
        _getContactByNodeID.restore();
        _findNode.restore();
        _save.restore();
        done();
      };
      farmer._negotiateContract(contract);
    });

  });

});
