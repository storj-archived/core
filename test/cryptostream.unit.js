'use strict';

var expect = require('chai').expect;
var DataCipherKeyIv = require('../lib/cipherkeyiv');
var NodeEncryptStream = require('../lib/cryptostream/node/encrypt');
var NodeDecryptStream = require('../lib/cryptostream/node/decrypt');
var BrowserEncryptStream = require('../lib/cryptostream/browser/encrypt');
var BrowserDecryptStream = require('../lib/cryptostream/browser/decrypt');
var cryptoStub = require('../lib/cryptostream/browser/crypto_stub');

describe('node EncryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(new NodeEncryptStream(
        DataCipherKeyIv()
      )).to.be.instanceOf(NodeEncryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(NodeEncryptStream(DataCipherKeyIv())).to.be.instanceOf(NodeEncryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        NodeEncryptStream(null);
      }).to.throw(Error, 'Invalid cipher object supplied');
    });

  });

});

describe('node DecryptStream', function() {

  describe('@constructor', function() {

    it('should create instance with the new keyword', function() {
      expect(
        new NodeDecryptStream(DataCipherKeyIv())
      ).to.be.instanceOf(NodeDecryptStream);
    });

    it('should create instance without the new keyword', function() {
      expect(NodeDecryptStream(DataCipherKeyIv())).to.be.instanceOf(NodeDecryptStream);
    });

    it('should throw with an invalid keypair', function() {
      expect(function() {
        NodeDecryptStream(null);
      }).to.throw(Error, 'Invalid cipher object supplied');
    });

  });

});

describe('CryptoStream/Integration', function() {

  it('should successfully encrypt and decrypt the data', function(done) {
    var keyiv = new DataCipherKeyIv();
    var encrypter = new NodeEncryptStream(keyiv);
    var decrypter = new NodeDecryptStream(keyiv);
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

var shouldStubPrototype = function(member){
  it('should expose a `prototype` property that is a function', function() {
    expect(typeof(member.prototype)).to.equal('function');
  });

  it('should expose an `apply` property that is a function', function() {
    expect(typeof(member.apply)).to.equal('function');
  });
};

describe('crypto stub', function(){
  describe('#Cipheriv', function(){
    shouldStubPrototype(cryptoStub.Cipheriv);
  });
  
  describe('#Decipheriv', function(){
    shouldStubPrototype(cryptoStub.Decipheriv);
  });
});

describe('browser EncryptStream', function(){
  it('should not be undefined', function() {
    var keyiv = new DataCipherKeyIv();
    var encryptor = new BrowserEncryptStream(keyiv);

    expect(typeof(encryptor)).to.not.equal('undefined');
  });
});

describe('browser DecryptStream', function(){
  it('should not be undefined', function() {
    var keyiv = new DataCipherKeyIv();
    var decryptor = new BrowserDecryptStream(keyiv);

    expect(typeof(decryptor)).to.not.equal('undefined');
  });
});
