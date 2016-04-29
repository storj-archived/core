'use strict';

var expect = require('chai').expect;
var RAMStorageAdapter = require('../../lib/storage/adapters/ram');
var Manager = require('../../lib/manager');
var Logger = require('kad').Logger;
var DataChannelServer = require('../../lib/datachannel/server');
var sinon = require('sinon');
var EventEmitter = require('events').EventEmitter;
var http = require('http');

describe('DataChannelServer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      })).to.be.instanceOf(DataChannelServer);
    });

  });

  describe('#reject', function() {

    it('should not try to close a client that does not exist', function() {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      dcs._allowed.token = { client: null };
      dcs.reject('token');
      expect(dcs._allowed.token).to.equal(undefined);
    });

  });

  describe('#close', function() {

    it('should close the underlying server', function() {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      dcs._server = { close: sinon.stub() };
      dcs.close();
      expect(dcs._server.close.called).to.equal(true);
    });

  });

  describe('#_handleConnection', function() {

    it('should close the socket on error', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(500);
        expect(message).to.equal('Socket error');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('error', new Error('Socket error'));
      });
    });

    it('should close the socket if invalid json is sent', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(400);
        expect(message).to.equal('Failed to parse message');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', 'not json data');
      });
    });

    it('should close the socket if auth fails', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(401);
        expect(message).to.equal('The supplied token is not accepted');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', JSON.stringify({
          token: 'token',
          hash: 'wrong'
        }));
      });
    });

    it('should close the socket if bad operation', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      });
      dcs._allowed.token = { client: null, hash: 'test' };
      var socket = new EventEmitter();
      socket.close = function(code, message) {
        expect(code).to.equal(400);
        expect(message).to.equal('Failed to handle the defined operation');
        done();
      };
      dcs._handleConnection(socket);
      setImmediate(function() {
        socket.emit('message', JSON.stringify({
          token: 'token',
          hash: 'test',
          operation: 'INVALID'
        }));
      });
    });

  });

  describe('#_handleError', function() {

    it('should emit an error if the underlying server does', function(done) {
      var dcs = DataChannelServer({
        server: http.createServer(function noop() {}),
        manager: Manager(RAMStorageAdapter()),
        logger: Logger(0)
      }).on('error', function(err) {
        expect(err.message).to.equal('BOOM');
        done();
      });
      dcs._server.emit('error', new Error('BOOM'));
    });

  });

});
