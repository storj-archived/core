'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var TunnelServer = require('../../lib/tunnel/server');
var TunnelClient = require('../../lib/tunnel/client');
var http = require('http');
var ws = require('ws');

describe('TunnelClient+TunnelServer/Integration', function() {

  var localhttp = null;
  var localws = null;
  var tunserver = null;
  var tunclient = null;
  var entrance = null;
  var serverurl = null;

  var handlers = {
    http: function(req, res) {
      res.end();
    },
    ws: function(socket) {
      socket.close();
    }
  };

  before(function(done) {
    localhttp = http.createServer(function(req, res) {
      return handlers.http(req, res);
    });

    localhttp.listen(60002, function() {
      localws = ws.Server({ server: localhttp });

      localws.on('connection', function(socket) {
        return handlers.ws(socket);
      });
      done();
    });
  });

  it('should establish the tunnel', function(done) {
    tunserver = new TunnelServer({ port: 60000 });

    tunserver.createGateway(function(err, gw) {
      entrance = gw.getEntranceAddress();
      serverurl = 'ws://127.0.0.1:60000/tun?token=' + gw.getEntranceToken();
      tunclient = new TunnelClient(serverurl, 'http://127.0.0.1:60002');

      tunclient.once('error', done);
      tunclient.on('open', function() {
        tunclient.removeListener('error', done);
        done();
      });
      tunclient.open();
    });
  });

  it('should tunnel the RPC message and receive a response', function(done) {
    var _handler = sinon.stub(handlers, 'http', function(req, res) {
      var data = '';
      req.on('data', function(chunk) {
        data += chunk.toString();
      }).on('end', function() {
        data = JSON.parse(data);

        res.end(JSON.stringify({
          id: data.id,
          result: { text: 'greetings comrade!' }
        }));
      });
    });
    var _request = http.request({
      method: 'POST',
      hostname: '127.0.0.1',
      port: entrance.port
    }, function(res) {
      var data = '';

      res.on('data', function(chunk) {
        data += chunk.toString();
      }).on('end', function() {
        data = JSON.parse(data);

        expect(data.result.text).to.equal('greetings comrade!');
        _handler.restore();
        done();
      });
    });
    _request.write(JSON.stringify({
      id: '1234567890',
      method: 'TEST',
      params: {}
    }));
    _request.end();
  });

  it('should tunnel the datachannel textual messages', function(done) {
    var message = JSON.stringify({
      token: 'token',
      hash: 'hash',
      operation: 'operation'
    });
    var _handler = sinon.stub(handlers, 'ws', function(socket) {
      socket.on('message', function(data, flags) {
        expect(data).to.equal(message);
        expect(flags.binary).to.equal(undefined);
        socket.send(message, { binary: false });
      });
    });
    var client = new ws('ws://127.0.0.1:' + entrance.port);
    client.on('open', function() {
      client.on('message', function(data, flags) {
        expect(data).to.equal(message);
        expect(flags.binary).to.equal(undefined);
        _handler.restore();
        done();
      });
      client.send(message, { binary: false });
    });
  });

  it('should tunnel the datachannel binary messages', function(done) {
    var message = new Buffer('greetings comrade!');
    var _handler = sinon.stub(handlers, 'ws', function(socket) {
      socket.on('message', function(data, flags) {
        expect(Buffer.compare(data, message)).to.equal(0);
        expect(flags.binary).to.equal(true);
        socket.send(data, { binary: true });
      });
    });
    var client = new ws('ws://127.0.0.1:' + entrance.port);
    client.on('open', function() {
      client.on('message', function(data, flags) {
        expect(Buffer.compare(data, message)).to.equal(0);
        expect(flags.binary).to.equal(true);
        _handler.restore();
        done();
      });
      client.send(message, { binary: true });
    });
  });

});
