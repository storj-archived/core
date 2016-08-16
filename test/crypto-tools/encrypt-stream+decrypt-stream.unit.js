'use strict';

var expect = require('chai').expect;
var DataCipherKeyIv = require('../../lib/crypto-tools/cipher-key-iv');
var EncryptStream = require('../../lib/crypto-tools/encrypt-stream');
var DecryptStream = require('../../lib/crypto-tools/decrypt-stream');

describe('EncryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(new EncryptStream(
        DataCipherKeyIv()
      )).to.be.instanceOf(EncryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(EncryptStream(DataCipherKeyIv())).to.be.instanceOf(EncryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        EncryptStream(null);
      }).to.throw(Error, 'Invalid cipher object supplied');
    });

  });

});

describe('DecryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(
        new DecryptStream(DataCipherKeyIv())
      ).to.be.instanceOf(DecryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(DecryptStream(DataCipherKeyIv())).to.be.instanceOf(DecryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        DecryptStream(null);
      }).to.throw(Error, 'Invalid cipher object supplied');
    });

  });

});

describe('CryptoStream/Integration', function() {

  it('should successfully encrypt and decrypt the data', function(done) {
    var keyiv = new DataCipherKeyIv();
    var encrypter = new EncryptStream(keyiv);
    var decrypter = new DecryptStream(keyiv);
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
