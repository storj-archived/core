'use strict';

var KeyRing = require('../../lib/crypto-tools/keyring');
var DataCipherKeyIv = require('../../lib/crypto-tools/cipher-key-iv');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sinon = require('sinon');
var rimraf = require('rimraf');
var os = require('os');
var utils = require('../../lib/utils');

var cleanup = [];

var tmpfolder = function() {
  var folder = path.join(os.tmpdir(), Date.now().toString());
  fs.mkdirSync(folder);
  cleanup.push(folder);
  return folder;
};

describe('KeyRing', function() {
  this.timeout(6000);

  after(function() {
    cleanup.forEach(function(folder){
      rimraf.sync(folder);
    });
  });

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(KeyRing(tmpfolder())).to.be.instanceOf(KeyRing);
    });

    it('should create instance with the new keyword', function() {
      expect(new KeyRing(tmpfolder())).to.be.instanceOf(KeyRing);
    });

    it('should use the supplied passphrase', function() {
      var keyring = KeyRing(tmpfolder(), 'test');
      expect(keyring._pass).to.equal('test');
    });

    it('should create key.ring folder if not exists', function() {
      var tmp = tmpfolder();
      var folder = path.join(tmp, 'key.ring');
      rimraf.sync(folder);
      KeyRing(tmp, 'test');
      expect(utils.existsSync(folder)).to.equal(true);
    });

    it('should delete old keyring if it is too big to parse', function() {
      var tmp = tmpfolder();
      var _verify = sinon.stub(KeyRing.prototype, '_verify');
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
        path.join(tmp, 'keyring'),
        encrypt(JSON.stringify({'test3':{'junk':'junk'},'test4':{'a':'b'}}))
      );

      KeyRing(tmp, 'testpass');

      _JSON.restore();
      _verify.restore();
      expect(utils.existsSync(path.join(tmp, 'keyring'))).to.equal(false);
    });

    it('should run migrations if old file exists.', function() {
      var tmp = tmpfolder();
      var encrypt = function(data) {
        var cipher = crypto.createCipher(
          'aes-256-ctr', 'testpass'
        );
        var enc = cipher.update(data, 'utf8', 'hex');
        enc += cipher.final('hex');

        return enc;
      };
      fs.writeFileSync(
        path.join(tmp, 'keyring'),
        encrypt(JSON.stringify({'test3':{'junk':'junk'},'test4':{'a':'b'}}))
      );
      if (!utils.existsSync(path.join(tmp, 'key.ring'))) {
        fs.mkdirSync(path.join(tmp, 'key.ring'));
      }
      fs.writeFileSync(
        path.join(tmp, 'key.ring/test4'),
        encrypt(JSON.stringify({'a':'b'}))
      );
      KeyRing(tmp, 'testpass');
      var newFile = path.join(tmp, 'key.ring/test3');
      expect(utils.existsSync(newFile)).to.equal(true);
    });

  });

  describe('#generate', function() {

    it('should generate a keypair and return it', function() {
      var kr = new KeyRing(tmpfolder());
      expect(kr.generate('test')).to.be.instanceOf(DataCipherKeyIv);
    });

  });

  describe('#_verify', function() {

    it('should throw an exception if the password is invalid', function() {
      var tmp = tmpfolder();
      KeyRing(tmp, 'pass1');
      expect(function() {
        KeyRing(tmp, 'pass2');
      }).to.throw(Error, 'Invalid passphrase was supplied to KeyRing');
    });

  });

  describe('#del', function() {

    it('should delete a key', function() {
      var tmp = tmpfolder();
      var keyring = new KeyRing(tmp);
      fs.writeFileSync(
        path.join(tmp, 'key.ring/test5'),
        'contents'
      );
      keyring.del('test5');
      expect(
        utils.existsSync(path.join(tmp, 'key.ring/test5'))
      ).to.equal(false);
    });

    it('should do nothing if a key does not exist', function() {
      var tmp = tmpfolder();
      var keyring = new KeyRing(tmp);
      keyring.del('test5');
      expect(
        utils.existsSync(path.join(tmp, 'key.ring/test5'))
      ).to.equal(false);
    });

  });

  describe('#get', function() {

    it('should return null if no key for the given ID', function() {
      var kr = new KeyRing(tmpfolder());
      expect(kr.get('wrong')).to.equal(null);
    });

  });

  describe('#export', function() {

    it('should create a tar of keyring', function() {
      var tmp = tmpfolder();
      var keypath = path.join(tmp, 'tmpkeyring');
      var tar = path.join(tmp, 'testkeyring.tar.gz');

      rimraf.sync(keypath);
      rimraf.sync(tar);

      if (!utils.existsSync(keypath)) {
        fs.mkdirSync(keypath);
      }

      var kr = new KeyRing(keypath, 'password');
      kr.generate('testkey1');
      kr.generate('testkey2');
      kr.generate('testkey3');
      kr.export(tar, function() {
        expect(
          utils.existsSync(tar)
        ).to.equal(true);
      });
    });

  });

  describe('#set', function() {

    it('should set the key for the given id', function() {
      var kr = new KeyRing(tmpfolder());
      var keyiv = DataCipherKeyIv();
      kr.set('test2', keyiv);
      expect(kr.get('test2').toObject().pass).to.equal(keyiv.toObject().pass);
      expect(kr.get('test2').toObject().salt).to.equal(keyiv.toObject().salt);
    });

  });

  describe('#reset', function() {

    it('should change the keyring password', function(done) {
      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'oldpass');
      kr.generate('test');
      var decryptedpass = kr.get('test').toObject().pass;

      kr.reset('newpass', function() {
        expect(kr._pass).to.equal('newpass');
        expect(kr.get('test').toObject().pass).to.equal(decryptedpass);
        done();
      });
    });

    it('should not change the password if blank password', function(done) {
      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'oldpass');
      kr.generate('test');

      kr.reset('', function(err) {
        expect(err.message).to.equal('Your Password cannot be blank!');
        done();
      });
    });

    it('should not change password if cant export', function(done) {
      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'oldpass');
      kr.generate('test');
      var _export = sinon.stub(KeyRing.prototype, 'export').callsArgWith(
        1,
        new Error('error with export')
      );

      kr.reset('111k61g8u775', function(err) {
        expect(err.message).to.equal('error with export');
        _export.restore();
        done();
      });
    });

  });

  describe('#import', function() {

    var tmp = tmpfolder();
    var fldr1 = path.join(tmp, 'import1');
    var fldr2 = path.join(tmp, 'import2');
    var tar = path.join(tmp,'testkeyring2.tar.gz');

    before(function(done) {
      this.timeout(6000); // ),:
      if (!utils.existsSync(fldr1)) {
        fs.mkdirSync(fldr1);
      }

      if (!utils.existsSync(fldr2)) {
        fs.mkdirSync(fldr2);
      }

      var kr1 = KeyRing(fldr1, 'password');
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr1.generate('testkey1');
      kr1.generate('testkey2');
      kr1.export(tar, done);
      kr2.generate('testkey1');
    });

    it('should fail to import if incorrect password is used', function(done) {
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr2.import(
        tar,
        'incorrectpassword',
        function(err) {
          expect(err.message).to.equal('Failed to decrypt keyring');
          done();
        }
      );
    });

    it('should import keyring tarball into keyring', function(done) {
      var kr2 = KeyRing(fldr2, 'poopsword');

      kr2.import(
        tar,
        'password',
        function() {
          expect(
            utils.existsSync(path.join(fldr2, 'key.ring', 'testkey2'))
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

});
