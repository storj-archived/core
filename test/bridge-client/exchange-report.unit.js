'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var ExchangeReport = require('../../lib/bridge-client/exchange-report');

describe('Exchange Report', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  it('#toObject', function() {
    var report = new ExchangeReport({
      dataHash: 'd8e33c898eb5ccd6789b32ceaca4e1d4e8cc452f',
      reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
      farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
      clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
      exchangeStart: 1479247169809,
      exchangeEnd: 1479250511087,
      exchangeResultCode: 1000,
      exchangeResultMessage: 'SUCCESS'
    });

    expect(report.toObject()).to.deep.equal({
      dataHash: 'd8e33c898eb5ccd6789b32ceaca4e1d4e8cc452f',
      reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
      farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
      clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
      exchangeStart: 1479247169809,
      exchangeEnd: 1479250511087,
      exchangeResultCode: 1000,
      exchangeResultMessage: 'SUCCESS'
    });

  });

  describe('#begin/#end', function() {
    it('it should record start and end time', function() {
      var report = new ExchangeReport({
        reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
        farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
        clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
      });

      expect(report._r.exchangeStart).to.equal(null);
      expect(report._r.exchangeEnd).to.equal(null);

      sandbox.stub(Date, 'now').returns(1479251099379);
      var dataHash = '55736f88e72c42e732defdbfda258cbe0f8be94b';
      report.begin(dataHash);
      expect(report._r.exchangeStart).to.equal(1479251099379);

      sandbox.restore();
      sandbox.stub(Date, 'now').returns(1479251141714);
      report.end(ExchangeReport.SUCCESS, 'SUCCESS_MESSAGE');
      expect(report._r.exchangeEnd).to.equal(1479251141714);

      expect(report.toObject()).to.deep.equal({
        reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
        farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
        clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
        dataHash: '55736f88e72c42e732defdbfda258cbe0f8be94b',
        exchangeStart: 1479251099379,
        exchangeEnd: 1479251141714,
        exchangeResultCode: 1000,
        exchangeResultMessage: 'SUCCESS_MESSAGE'
      });

    });

  });

});
