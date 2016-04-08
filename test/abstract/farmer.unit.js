'use strict';

var expect = require('chai').expect;
var storj = require('../../');
var JSONLogger = require('kad-logger-json');
var TelemetryReporter = require('../../lib/extensions/telemetry');
var FarmerFactory = require('../../lib/abstract/farmer');

describe('FarmerFactory#create', function() {

  var factory = new FarmerFactory();

  it('should create the farmer, logger, and reporter', function(done) {
    factory.create({
      network: { forward: false, port: 4000 },
      telemetry: { enabled: true },
      address: storj.KeyPair().getAddress()
    }, function(err, farmer) {
      expect(farmer.node).to.be.instanceOf(storj.Network);
      expect(farmer.logger).to.be.instanceOf(JSONLogger);
      expect(farmer.reporter).to.be.instanceOf(TelemetryReporter);
      done();
    });
  });

  it('should create the farmer, and logger', function(done) {
    factory.create({
      network: { forward: false, port: 4001 },
      telemetry: { enabled: false }
    }, function(err, farmer) {
      expect(farmer.node).to.be.instanceOf(storj.Network);
      expect(farmer.logger).to.be.instanceOf(JSONLogger);
      expect(farmer.reporter).to.equal(null);
      done();
    });
  });

});
