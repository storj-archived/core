'use strict';

var expect = require('chai').expect;
var HDKeyPair = require('../../lib/crypto-tools/hdkeypair');
var KeyPair = require('../../lib/crypto-tools/keypair');

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4dd0' +
    '15834341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103bce8af';
var sprv = 'sprvzVyuYAoKAb6XvVSqysmNF1TkgtZPGtWrHQngsdHQaKjJ3XJuBswmgrB' +
    'qLi1RM67LDMZNLfz4WzndmjQtzWFJrDtuGAPRqAm9yLvSf7G4ppaF';
var spub = 'spubXxSj14PkKcJcj7PeaqFaHvL3tCGk55tXrWtsvtmSrmW2EfC3p7YbR42' +
    'ezCP6qkJ7EV25ANPYm5BwPQWX4dDLadQd8pDm33AuzuH5jxLsuBhB';
var priv = '15493c2be2a4159cd982b93caf3d705fd29b9bac778031caea216efbebfe2478';
var pub = '022aecb922ae001d9d0cb96927e550ee6cfd60741ac627f10289fe2c293b3c7341';
var chain = '26071b1dc79244cd6b8ffd3e12565d32b9bdea4c2196437cd45fa47c6330f55f';

describe('HD Key Pair', function() {

  it('will serialize with storj node versions', function() {
    var key = HDKeyPair.fromMasterSeed(new Buffer(seed, 'hex'));
    expect(key.privateExtendedKey).to.equal(sprv);
    expect(key.publicExtendedKey).to.equal(spub);
  });

  it('will deserialize from sprv', function() {
    var key = HDKeyPair.fromExtendedKey(sprv);
    expect(key).to.be.instanceOf(HDKeyPair);
    expect(key.privateKey.toString('hex')).to.equal(priv);
    expect(key.publicKey.toString('hex')).to.equal(pub);
    expect(key.index).to.equal(0);
    expect(key.depth).to.equal(0);
    expect(key.parentFingerprint).to.equal(0);
    expect(key.chainCode.toString('hex')).to.equal(chain);
    expect(key.fingerprint).to.equal(722394980);
    expect(key.identifier.toString('hex')).to.equal('2b0edf64a476bb34ede25e030bd602cbdf7e46e4');
  });

  it('will deserialize from spub', function() {
    var key = HDKeyPair.fromExtendedKey(spub);
    expect(key).to.be.instanceOf(HDKeyPair);
    expect(key.privateKey).to.equal(null);
    expect(key.publicKey.toString('hex')).to.equal(pub);
    expect(key.index).to.equal(0);
    expect(key.depth).to.equal(0);
    expect(key.parentFingerprint).to.equal(0);
    expect(key.chainCode.toString('hex')).to.equal(chain);
    expect(key.fingerprint).to.equal(722394980);
    expect(key.identifier.toString('hex')).to.equal('2b0edf64a476bb34ede25e030bd602cbdf7e46e4');
  });

  it('will convert to key pair', function() {
    var key = HDKeyPair.fromMasterSeed(new Buffer(seed, 'hex'));
    var keyPair = key.toKeyPair();
    expect(keyPair).to.be.instanceOf(KeyPair);
    expect(keyPair.getPrivateKey()).to.equal(priv);
    expect(keyPair.getPublicKey()).to.equal(pub);
  });

});
