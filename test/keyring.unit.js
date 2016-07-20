'use strict';

var KeyRing = require('../lib/keyring');
var DataCipherKeyIv = require('../lib/cipherkeyiv');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sinon = require('sinon');
var rimraf = require('rimraf');

var tmpfolder = require('os').tmpdir();

describe('KeyRing', function() {

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(KeyRing(tmpfolder)).to.be.instanceOf(KeyRing);
    });

    it('should create instance with the new keyword', function() {
      expect(new KeyRing(tmpfolder)).to.be.instanceOf(KeyRing);
    });

    it('should use the supplied passphrase', function() {
      var keyring = KeyRing(tmpfolder, 'test');
      expect(keyring._pass).to.equal('test');
    });

    it('should create key.ring folder if not exists', function() {
      var folder = path.join(tmpfolder, 'key.ring');
      rimraf.sync(folder);
      KeyRing(tmpfolder, 'test');
      expect(fs.existsSync(folder)).to.equal(true);
    });

    it('should delete old keyring if it is too big to parse', function() {
      var _JSON = sinon.stub(JSON, 'parse').throws('Error');

      var encrypt = function(data) {
        var cipher = crypto.createCipher(
          'aes-256-ctr', 'testpass'
        );
        var enc = cipher.update(data, 'utf8', 'hex');
        enc += cipher.final('hex');

        return enc;
      };

      fs.writeFileSync(
        path.join(tmpfolder, 'keyring'),
        encrypt(JSON.stringify({'test3':{'junk':'junk'},'test4':{'a':'b'}}))
      );

      KeyRing(tmpfolder, 'testpass');

      _JSON.restore();
      expect(fs.existsSync(path.join(tmpfolder, 'keyring'))).to.equal(false);
    });

    it('should run migrations if old file exists.', function() {
      var encrypt = function(data) {
        var cipher = crypto.createCipher(
          'aes-256-ctr', 'testpass'
        );
        var enc = cipher.update(data, 'utf8', 'hex');
        enc += cipher.final('hex');

        return enc;
      };
      fs.writeFileSync(
        path.join(tmpfolder, 'keyring'),
        encrypt(JSON.stringify({'test3':{'junk':'junk'},'test4':{'a':'b'}}))
      );
      fs.writeFileSync(
        path.join(tmpfolder, 'key.ring/test4'),
        encrypt(JSON.stringify({'a':'b'}))
      );
      KeyRing(tmpfolder, 'testpass');
      var newFile = path.join(tmpfolder, 'key.ring/test3');
      expect(fs.existsSync(newFile)).to.equal(true);
    });

  });

  describe('#generate', function() {

    it('should generate a keypair and return it', function() {
      var kr = new KeyRing(tmpfolder);
      expect(kr.generate('test')).to.be.instanceOf(DataCipherKeyIv);
    });

  });

  describe('#deleteKeyFromKeyRing', function() {

    it('should delete a key', function() {
      fs.writeFileSync(
        path.join(tmpfolder, 'key.ring/test5'),
        'contents'
      );
      var keyring = new KeyRing(tmpfolder);
      keyring.deleteKeyFromKeyRing('test5');
      expect(
        fs.existsSync(path.join(tmpfolder, 'key.ring/test5'))
      ).to.equal(false);
    });

  });

  describe('#get', function() {

    it('should return null if no key for the given ID', function() {
      var kr = new KeyRing(tmpfolder);
      expect(kr.get('wrong')).to.equal(null);
    });

  });

  describe('#set', function() {

    it('should set the key for the given id', function() {
      var kr = new KeyRing(tmpfolder);
      var keyiv = DataCipherKeyIv();
      kr.set('test2', keyiv);
      expect(kr.get('test2').toObject().pass).to.equal(keyiv.toObject().pass);
      expect(kr.get('test2').toObject().salt).to.equal(keyiv.toObject().salt);
    });

  });

});
