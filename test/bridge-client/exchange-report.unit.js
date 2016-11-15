'use strict';

var expect = require('chai').expect;
var ExchangeReport = require('../../lib/bridge-client/exchange-report');

describe('Exchange Report', function() {

  it('#toObject', function() {
    var report = new ExchangeReport({
      reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
      farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
      clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
      exchangeTime: 1479247169809,
      exchangeResultCode: 1000,
      exchangeResultMessage: 'SUCCESS'
    });
    
    expect(report.toObject()).to.deep.equal({
      reporterId: '538db66de92c02dc52cde37307ace5463917cbf0',
      farmerId: '41ff35b1fac9981685b4423f91acc11ec345cd36',
      clientId: '2c33e90b668313c96733b269a3f5c7b7ab2128e1',
      exchangeTime: 1479247169809,
      exchangeResultCode: 1000,
      exchangeResultMessage: 'SUCCESS'
    });
    
  });

  
});
