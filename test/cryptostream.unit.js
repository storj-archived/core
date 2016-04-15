'use strict';

var expect = require('chai').expect;
var KeyPair = require('../lib/keypair');
var EncryptStream = require('../lib/cryptostream/encrypt');
var DecryptStream = require('../lib/cryptostream/decrypt');

describe('EncryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(new EncryptStream(KeyPair())).to.be.instanceOf(EncryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(EncryptStream(KeyPair())).to.be.instanceOf(EncryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        EncryptStream(null);
      }).to.throw(Error, 'Invalid keypair object supplied');
    });

  });

});

describe('DecryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(new DecryptStream(KeyPair())).to.be.instanceOf(DecryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(DecryptStream(KeyPair())).to.be.instanceOf(DecryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        DecryptStream(null);
      }).to.throw(Error, 'Invalid keypair object supplied');
    });

  });

});

describe('CryptoStream/Integration', function() {

  it('should successfully encrypt and decrypt the data', function(done) {
    var keypair = new KeyPair();
    var encrypter = new EncryptStream(keypair);
    var decrypter = new DecryptStream(keypair);
    var input = ['HAY', 'GURL', 'HAY'];
    var output = '';

    encrypter.pipe(decrypter).on('data', function(data) {
      output += data.toString();
    }).on('end', function() {
      expect(output).to.equal(input.join(''));
      done();
    });

    input.forEach(function(data) {
      encrypter.write(data);
    });

    encrypter.end();
  });

});
