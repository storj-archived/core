'use strict';

var KeyRing = require('../lib/keyring');
var DataCipherKeyIv = require('../lib/cipherkeyiv');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sinon = require('sinon');
var rimraf = require('rimraf');
var os = require('os');

var tmpfolder = os.tmpdir();

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

  describe('#del', function() {

    it('should delete a key', function() {
      fs.writeFileSync(
        path.join(tmpfolder, 'key.ring/test5'),
        'contents'
      );
      var keyring = new KeyRing(tmpfolder);
      keyring.del('test5');
      expect(
        fs.existsSync(path.join(tmpfolder, 'key.ring/test5'))
      ).to.equal(false);
    });

    it('should do nothing if a key does not exist', function() {
      var keyring = new KeyRing(tmpfolder);
      keyring.del('test5');
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

  describe('#export', function() {

    it('should create a tar of keyring', function() {
      var keypath = path.join(tmpfolder, 'tmpkeyring');
      var tar = path.join(tmpfolder, 'testkeyring.tar.gz');

      rimraf.sync(keypath);
      rimraf.sync(tar);

      if (!fs.existsSync(keypath)) {
        fs.mkdirSync(keypath);
      }

      var kr = new KeyRing(keypath, 'password');
      kr.generate('testkey1');
      kr.generate('testkey2');
      kr.generate('testkey3');
      kr.export(tar, function() {
        expect(
          fs.existsSync(tar)
        ).to.equal(true);
      });
    });

  });

  describe('#import', function() {

    var fldr1 = path.join(tmpfolder, 'import1');
    var fldr2 = path.join(tmpfolder, 'import2');
    var tar = path.join(tmpfolder,'testkeyring2.tar.gz');

    before(function(done) {
      if (!fs.existsSync(fldr1)) {
        fs.mkdirSync(fldr1);
      }

      if (!fs.existsSync(fldr2)) {
        fs.mkdirSync(fldr2);
      }

      var kr1 = KeyRing(fldr1, 'password');
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr1.generate('testkey1');
      kr1.generate('testkey2');
      kr1.export(tar, done);
      kr2.generate('testkey1');
    });

    it('should import keyring tarball into keyring', function(done) {
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr2.import(
        tar,
        'password',
        function() {
          expect(
            fs.existsSync(path.join(fldr2, 'key.ring', 'testkey2'))
          ).to.equal(true);
          done();
        }
      );
    });

    it('should change the password used to encrypt each key', function(done) {
      var kr1 = KeyRing(fldr1, 'password');
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr2.import(
        tar,
        'password',
        function() {
          expect(
            kr1.get('testkey2').toObject().pass
          ).to.equal(
            kr2.get('testkey2').toObject().pass
          );
          done();
        }
      );
    });

    after(function() {
      rimraf.sync(fldr1);
      rimraf.sync(fldr2);
      fs.unlinkSync(tar);
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
