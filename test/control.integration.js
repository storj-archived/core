'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { Server, Client } = require('../lib/control');
const { Readable } = require('stream');


describe('@module storjd/control (integration)', function() {

  const rs = new Readable({ read: () => null, objectMode: true });

  let sandbox = sinon.sandbox.create();
  let node = {
    ping: sandbox.stub().callsArgWith(1, null, []),
    join: sandbox.stub().callsArgWith(1, new Error('Failed to join')),
    subscribeCapacityAnnouncement: sandbox.stub().callsArgWith(1, null, rs)
  };
  let server = new Server(node);
  let client = new Client();

  before((done) => {
    server.listen(10001);
    setTimeout(() => {
      client.connect(10001);
      done();
    }, 500);
  });

  after(() => server.server.close());

  it('should send command over control and process callback', function(done) {
    client.ping(['identity', { xpub: 'xpubkey' }], (err, result) => {
      expect(err).to.equal(null);
      expect(result).to.have.lengthOf(0);
      done();
    });
  });

  it('should send command over control and process error', function(done) {
    client.join(['identity', { xpub: 'xpubkey' }], (err) => {
      expect(err.message).to.equal('Failed to join');
      done();
    });
  });

  it('should send command over control and process stream', function(done) {
    client.subscribeCapacityAnnouncement('01010101', (err, stream) => {
      let events = 0;
      stream.on('data', (data) => {
        expect(data.beep).to.equal('boop');
        events++;
      }).once('end', () => {
        expect(events).to.equal(3);
        done();
      });
      rs.push({ beep: 'boop' });
      rs.push({ beep: 'boop' });
      rs.push({ beep: 'boop' });
      rs.push(null);
    });
  });

});

