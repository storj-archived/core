'use strict';

const sinon = require('sinon');
const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');
const pem = require('pem');
const { expect } = require('chai');
const Transport = require('../lib/transport');


describe('@class Transport', function() {

  let ssl = null;

  before(function(done) {
    pem.createCertificate({ days: 1, selfSigned: true }, (err, keys) => {
      ssl = { key: keys.serviceKey, cert: keys.certificate };
      done(err);
    });
  });

  describe('@private _createRequest', function() {

    it('should return a https request object', function() {
      const transport = new Transport(ssl);
      const request = transport._createRequest();
      expect(request).to.be.instanceOf(http.ClientRequest);
    });

  });

  describe('@private _createServer', function() {

    it('should return a https server object', function() {
      const transport = new Transport(ssl);
      const server = transport._createServer(ssl);
      expect(server).to.be.instanceOf(https.Server);
    });

    it('should disable nagle on connection', function(done) {
      const transport = new Transport(ssl);
      const server = transport._createServer(ssl);
      const setNoDelay = sinon.stub();
      const socket = new EventEmitter();
      socket.setNoDelay = setNoDelay;
      server.removeListener('connection',
                            server.listeners('connection').shift());
      server.emit('connection', socket);
      setImmediate(() => {
        expect(setNoDelay.calledWithMatch(true)).to.equal(true);
        done();
      });
    });

  });

  describe('@private _handle', function() {

    it('should return a handler function', function() {
      const transport = new Transport(ssl);
      const handler = transport._handle();
      expect(typeof handler).to.equal('function');
    });

  });

  describe('@private _cors', function() {

    it('should set the cors headers and respond to options', function(done) {
      const transport = new Transport(ssl);
      const setHeader = sinon.stub();
      const response = {
        setHeader,
        end: () => {
          expect(setHeader.calledWithMatch('access-control-allow-origin'))
            .to.equal(true);
          expect(setHeader.calledWithMatch('access-control-allow-methods'))
            .to.equal(true);
          expect(setHeader.calledWithMatch('access-control-allow-headers'))
            .to.equal(true);
          done();
        }
      };
      transport._cors({ headers: [], method: 'OPTIONS' }, response);
    });

    it('should set the cors headers and callback', function(done) {
      const transport = new Transport(ssl);
      const setHeader = sinon.stub();
      const response = {
        setHeader,
        end: () => done(new Error('res.end() should not be called'))
      };
      transport._cors({ headers: [], method: 'POST' }, response, () => {
        expect(setHeader.calledWithMatch('access-control-allow-origin'))
          .to.equal(true);
        expect(setHeader.calledWithMatch('access-control-allow-methods'))
          .to.equal(true);
        expect(setHeader.calledWithMatch('access-control-allow-headers'))
          .to.equal(true);
        done();
      });
    });

  });

  describe('@private _shards', function() {

    it('should emit upload event with request and response', function(done) {
      const transport = new Transport(ssl);
      const request = {
        url: 'https://localhost:8080/shards/{hash}?token={token}',
        method: 'POST'
      };
      const response = {};
      transport.once('upload', (req, res) => {
        expect(req.query.token).to.equal('{token}');
        expect(req.params.hash).to.equal('%7Bhash%7D');
        expect(res).to.equal(response);
        done();
      });
      transport._shards(request, response);
    });

    it('should emit download event qith request and response', function(done) {
      const transport = new Transport(ssl);
      const request = {
        url: 'https://localhost:8080/shards/{hash}?token={token}',
        method: 'GET'
      };
      const response = {};
      transport.once('download', (req, res) => {
        expect(req.query.token).to.equal('{token}');
        expect(req.params.hash).to.equal('%7Bhash%7D');
        expect(res).to.equal(response);
        done();
      });
      transport._shards(request, response);
    });

    it('should end the response with a 405 status code', function(done) {
      const transport = new Transport(ssl);
      const request = {
        url: 'https://localhost:8080/shards/{hash}?token={token}',
        method: 'PUT'
      };
      const response = {
        end: () => {
          expect(response.statusCode).to.equal(405);
          done();
        }
      };
      transport._shards(request, response);
    });

  });

});
