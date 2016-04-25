'use strict';

var kad = require('kad');
var constants = require('../../lib/constants');
var expect = require('chai').expect;
var TunnelDemuxer = require('../../lib/tunnel/demultiplexer');

describe('TunnelDemuxer', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(TunnelDemuxer()).to.be.instanceOf(TunnelDemuxer);
    });

    it('should create an instance with the new keyword', function() {
      expect(new TunnelDemuxer()).to.be.instanceOf(TunnelDemuxer);
    });

  });

  describe('#_demuxDataChannel', function() {

    it('should return an error for invalid opcode', function(done) {
      TunnelDemuxer()._demuxDataChannel(Buffer([0x00, 0x00]), function(err) {
        expect(err.message).to.equal('Invalid frame type opcode supplied');
        done();
      });
    });

  });

  describe('#transform', function() {

    var tdmuxer = new TunnelDemuxer();

    it('should transform the correct format for RPC messages', function(done) {
      tdmuxer.once('data', function(object) {
        expect(object.type).to.equal('rpc');
        expect(object.data).to.be.instanceOf(kad.Message);
        expect(object.data.method).to.equal('PING');
        done();
      });
      tdmuxer.write(Buffer.concat([
        Buffer([constants.OPCODE_TUNRPC_PREFIX]),
        kad.Message({ method: 'PING', params: {} }).serialize()
      ]));
    });

    it('should read the correct format for datachannel text', function(done) {
      tdmuxer.once('data', function(object) {
        expect(object.type).to.equal('datachannel');
        expect(object.flags.quid).to.equal('010203040506');
        expect(object.flags.binary).to.equal(false);
        expect(JSON.parse(object.data).token).to.equal('token');
        done();
      });
      tdmuxer.write(Buffer.concat([
        Buffer([constants.OPCODE_TUNDCX_PREFIX]),
        Buffer([0x01]),
        Buffer([1, 2, 3, 4, 5, 6]),
        Buffer(JSON.stringify({
          token: 'token',
          hash: 'hash',
          operation: 'operation'
        }))
      ]));
    });

    it('should read the correct format for datachannel blobs', function(done) {
      tdmuxer.once('data', function(object) {
        expect(object.type).to.equal('datachannel');
        expect(object.flags.quid).to.equal('010203040506');
        expect(object.flags.binary).to.equal(true);
        expect(object.data.toString()).to.equal('hello demuxer');
        done();
      });
      tdmuxer.write(Buffer.concat([
        Buffer([constants.OPCODE_TUNDCX_PREFIX]),
        Buffer([0x02]),
        Buffer([1, 2, 3, 4, 5, 6]),
        Buffer('hello demuxer')
      ]));
    });

    it('should emit an error when invlid data written', function(done) {
      tdmuxer.on('error', function(err) {
        expect(err.message).to.equal('Invalid input for tunnel demuxing');
        done();
      }).write({ something: 'wrong' });
    });

  });

});
