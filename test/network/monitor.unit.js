'use strict';

var Network = require('../../lib/network');
var Monitor = require('../../lib/network/monitor');
var expect = require('chai').expect;
var kad = require('kad');
var Manager = require('../../lib/storage/manager');
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var KeyPair = require('../../lib/crypto-tools/keypair');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;

describe('Network/Monitor', function() {

  describe('@constructor', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should create an instance without the new keyword', function() {
      expect(Monitor(net)).to.be.instanceOf(Monitor);
    });

    it('should create an instance with the new keyword', function() {
      expect(new Monitor(net)).to.be.instanceOf(Monitor);
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

  describe('#start', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should start the soft and hard intervals', function() {
      var mon = new Monitor(net);
      expect(mon.start()).to.equal(true);
      expect(mon._softInterval).to.not.equal(undefined);
      expect(mon._hardInterval).to.not.equal(undefined);
    });

    it('should not start the soft and hard intervals if started', function() {
      var mon = new Monitor(net);
      expect(mon.start()).to.equal(true);
      expect(mon._softInterval).to.not.equal(undefined);
      expect(mon._hardInterval).to.not.equal(undefined);
      expect(mon.start()).to.equal(false);
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

  describe('#stop', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should stop the soft and hard intervals', function() {
      var mon = new Monitor(net);
      mon.start();
      expect(mon.stop()).to.equal(true);
      expect(mon._softInterval).to.equal(undefined);
      expect(mon._hardInterval).to.equal(undefined);
    });

    it('should not stop the soft and hard intervals if stopped', function() {
      var mon = new Monitor(net);
      mon.start();
      expect(mon.stop()).to.equal(true);
      expect(mon._softInterval).to.equal(undefined);
      expect(mon._hardInterval).to.equal(undefined);
      expect(mon.stop()).to.equal(false);
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

  describe('#getSnapshot', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should return the current snapshot', function() {
      expect(Monitor(net).getSnapshot().timestamp).to.not.equal(undefined);
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

  describe('#_collectSoftStats', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should call the soft collectors', function(done) {
      var getConnectedPeers = sinon.stub(
        Monitor,
        'getConnectedPeers'
      ).callsArgWith(1, null, {});
      var getDiskUtilization = sinon.stub(
        Monitor,
        'getDiskUtilization'
      ).callsArgWith(1, null, {});
      var mon = new Monitor(net);
      mon._collectSoftStats();
      setImmediate(function() {
        getConnectedPeers.restore();
        getDiskUtilization.restore();
        expect(getConnectedPeers.called).to.equal(true);
        expect(getDiskUtilization.called).to.equal(true);
        done();
      });
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

  describe('#_collectHardStats', function() {

    var net = new Network({
      keyPair: new KeyPair(),
      storageManager: new Manager(new RAMStorageAdapter()),
      logger: new kad.Logger(),
      rpcPort: 0,
      tunnelServerPort: 0
    });

    it('should call the hard collectors', function(done) {
      var getPaymentAddressBalances = sinon.stub(
        Monitor,
        'getPaymentAddressBalances'
      ).callsArgWith(1, null, {});
      var mon = new Monitor(net);
      mon._collectHardStats();
      setImmediate(function() {
        getPaymentAddressBalances.restore();
        expect(getPaymentAddressBalances.called).to.equal(true);
        done();
      });
    });

    after(function(done) {
      net.transport.close(done);
    });

  });

});

describe('Monitor#getConnectedPeers', function() {

  it('should return the number of peers', function(done) {
    Monitor.getConnectedPeers({
      router: {
        _buckets: {
          0: { getSize: sinon.stub().returns(3) },
          1: { getSize: sinon.stub().returns(3) },
          2: { getSize: sinon.stub().returns(3) },
          3: { getSize: sinon.stub().returns(3) }
        }
      }
    }, function(err, stats) {
      expect(stats.peers.connected).to.equal(12);
      done();
    });
  });

});

describe('Monitor#getDiskUtilization', function() {

  it('should return the free and used space', function(done) {
    Monitor.getDiskUtilization({
      storageManager: {
        _options: { maxCapacity: 2048 },
        _storage: { size: sinon.stub().callsArgWith(0, null, 1024) }
      }
    }, function(err, stats) {
      expect(stats.disk.used).to.equal(1024);
      expect(stats.disk.free).to.equal(1024);
      done();
    });
  });

  it('should return the free and used space if error', function(done) {
    Monitor.getDiskUtilization({
      storageManager: {
        _options: { maxCapacity: 2048 },
        _storage: { size: sinon.stub().callsArgWith(0, new Error('Failed')) }
      }
    }, function(err, stats) {
      expect(stats.disk.used).to.equal(0);
      expect(stats.disk.free).to.equal(2048);
      done();
    });
  });

});

describe('Monitor#getPaymentAddressBalances', function() {

  it('should use the keypair address', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        expect(opts.url).to.equal(
          'https://counterpartychain.io/api/balances/' + kp.getAddress()
        );
        callback(null, { statusCode: 200 });
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: {}
    }, done);
  });

  it('should use the defined address', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        expect(opts.url).to.equal(
          'https://counterpartychain.io/api/balances/1234'
        );
        callback(null, { statusCode: 200 });
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: { paymentAddress: '1234' }
    }, done);
  });

  it('should return 0 if there is a request error', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        callback(new Error('Failed'));
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: { payment: { address: '1234' } }
    }, function(err, stats) {
      expect(stats.payments.balances.sjcx).to.equal(0);
      expect(stats.payments.balances.sjct).to.equal(0);
      done();
    });
  });

  it('should return 0 if there is a non-200 status', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        callback(null, { statusCode: 400 });
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: { payment: { address: '1234' } }
    }, function(err, stats) {
      expect(stats.payments.balances.sjcx).to.equal(0);
      expect(stats.payments.balances.sjct).to.equal(0);
      done();
    });
  });

  it('should return the balances', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        callback(null, { statusCode: 200 }, {
          success: 1,
          total: 4,
          data: [
            {
              asset: 'SJCX',
              amount: '25000.00000000'
            },
            {
              asset: 'SJCT',
              amount: '25000.00000000'
            }
          ]
        });
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: { payment: { address: '1234' } }
    }, function(err, stats) {
      expect(stats.payments.balances.sjcx).to.equal(25000);
      expect(stats.payments.balances.sjct).to.equal(25000);
      done();
    });
  });

  it('should return 0 if the address is invalid', function(done) {
    var kp = new KeyPair();
    var StubbedMonitor = proxyquire('../../lib/network/monitor', {
      request: function(opts, callback) {
        callback(null, { statusCode: 200 }, {
          success: 0,
          error: 'Invalid address'
        });
      }
    });
    StubbedMonitor.getPaymentAddressBalances({
      keyPair: kp,
      _options: { payment: { address: '1234' } }
    }, function(err, stats) {
      expect(stats.payments.balances.sjcx).to.equal(0);
      expect(stats.payments.balances.sjct).to.equal(0);
      done();
    });
  });

});

describe('Monitor#getContractsDetails', function() {

  it('should return the number of contracts', function(done) {
    var stream = new EventEmitter();
    Monitor.getContractsDetails({
      storageManager: {
        _storage: {
          createReadStream: function() {
            return stream;
          }
        }
      }
    }, function(err, stats) {
      expect(stats.contracts.total).to.equal(3);
      done();
    });
    setImmediate(function() {
      stream.emit('data', { contracts: { key: {} } });
      stream.emit('data', { contracts: { key: {} } });
      stream.emit('data', { contracts: { key: {} } });
      stream.emit('end');
    });
  });

  it('should return 0 contracts', function(done) {
    var stream = new EventEmitter();
    Monitor.getContractsDetails({
      storageManager: {
        _storage: {
          createReadStream: function() {
            return stream;
          }
        }
      }
    }, function(err, stats) {
      expect(stats.contracts.total).to.equal(0);
      done();
    });
    setImmediate(function() {
      stream.emit('error', new Error('Failed'));
    });
  });

});
