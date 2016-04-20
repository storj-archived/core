'use strict';

var kad = require('kad');
var crypto = require('crypto');
var constants = require('../../lib/constants');
var expect = require('chai').expect;
var TunnelGateway = require('../../lib/tunnel/gateway');
var TunnelMuxer = require('../../lib/tunnel/multiplexer');

describe('TunnelMuxer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(TunnelMuxer()).to.be.instanceOf(TunnelMuxer);
    });

    it('should create an instance with the new keyword', function() {
      expect(new TunnelMuxer()).to.be.instanceOf(TunnelMuxer);
    });

  });

  describe('#transform', function() {

    var gateway = new TunnelGateway();
    var tmuxer = new TunnelMuxer();

    tmuxer.source(gateway);

    it('should read the correct format for RPC messages', function(done) {
      var time = Date.now();
      tmuxer.once('data', function(data) {
        expect(Buffer.compare(
          data.slice(0, 1),
          Buffer([constants.OPCODE_TUNRPC_PREFIX])
        )).to.equal(0);
        expect(kad.Message.fromBuffer(data.slice(1)).method).to.equal('PING');
        expect(kad.Message.fromBuffer(data.slice(1)).params.t).to.equal(time);
        done();
      });
      gateway.emit('message/rpc', kad.Message({
        method: 'PING',
        params: { t: time }
      }));
    });

    it('should read the correct format for datachannel text', function(done) {
      var quid = crypto.randomBytes(6);
      var frame = JSON.stringify({
        token: 'token',
        hash: 'hash',
        operation: 'operation'
      });
      tmuxer.once('data', function(data) {
        expect(Buffer.compare(
          data.slice(0, 1),
          Buffer([constants.OPCODE_TUNDC_PREFIX])
        )).to.equal(0);
        expect(Buffer.compare(
          data.slice(1, 2),
          Buffer([0x01])
        )).to.equal(0);
        expect(Buffer.compare(data.slice(2, 8), quid)).to.equal(0);
        expect(data.slice(8).toString()).to.equal(frame);
        done();
      });
      gateway.emit('message/datachannel', frame, {
        binary: false,
        quid: quid.toString('hex')
      });
    });

    it('should read the correct format for datachannel blobs', function(done) {
      var quid = crypto.randomBytes(6);
      var frame = Buffer('hello muxer');
      tmuxer.once('data', function(data) {
        expect(Buffer.compare(
          data.slice(0, 1),
          Buffer([constants.OPCODE_TUNDC_PREFIX])
        )).to.equal(0);
        expect(Buffer.compare(
          data.slice(1, 2),
          Buffer([0x02])
        )).to.equal(0);
        expect(Buffer.compare(data.slice(2, 8), quid)).to.equal(0);
        expect(Buffer.compare(data.slice(8), frame)).to.equal(0);
        done();
      });
      gateway.emit('message/datachannel', frame, {
        binary: true,
        quid: quid.toString('hex')
      });
    });

    it('should emit an error when invlid data written', function(done) {
      tmuxer.once('error', function(err) {
        expect(err.message).to.equal('Invalid input for tunnel muxing');
        done();
      }).write({ something: 'wrong' });
    });

  });

});
