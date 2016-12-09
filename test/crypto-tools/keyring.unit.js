'use strict';

var KeyRing = require('../../lib/crypto-tools/keyring');
var DataCipherKeyIv = require('../../lib/crypto-tools/cipher-key-iv');
var DeterministicKeyIv = require('../../lib/crypto-tools/deterministic-key-iv');
var Mnemonic = require('bitcore-mnemonic');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sinon = require('sinon');
var rimraf = require('rimraf');
var os = require('os');
var mkdirp = require('mkdirp');
var utils = require('../../lib/utils');
var TMP_DIR = path.join(os.tmpdir(), 'STORJ_KEYRING_TEST');

var tmpfolder = function() {
  var folder = path.join(TMP_DIR, Date.now().toString());
  mkdirp.sync(folder);
  return folder;
};

describe('KeyRing', function() {
  this.timeout(6000);

  after(function() {
    rimraf.sync(TMP_DIR);
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

    it('should return a generated key if mnemonic exists', function() {
      var kr = new KeyRing(tmpfolder());
      kr._mnemonic = 'test test test';
      expect(kr.get('wrong')).to.not.equal(null);
    });

    it('should return deterministic key read from file', function() {
      var kr = new KeyRing(tmpfolder());
      kr.set('0123', DeterministicKeyIv('0123', '0123'));
      var retrieved = kr.get('0123').toObject();
      expect(retrieved.type).to.equal('DeterministicKeyIv');
    });

    it('should return DataCipherIv read from file', function() {
      var kr = new KeyRing(tmpfolder());
      kr.set('0123', DataCipherKeyIv('0123', '0123'));
      var retrieved = kr.get('0123').toObject();
      expect(retrieved.type).to.not.equal('DeterministicKeyIv');
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

  var testDeterministicKeys = function(){

    describe('#generateDeterministicKey', function() {

      var tmp = tmpfolder();
      var deterministicKeyPath = path.join(
        tmp,'key.ring', '.deterministic_key');

      var kr = new KeyRing(tmp, 'password');

      it('should create a valid deterministic key', function() {
        kr.generateDeterministicKey();
        expect(fs.existsSync(deterministicKeyPath)).to.equal(true);
        expect(typeof kr._mnemonic).to.equal('object');
        expect(kr._mnemonic).to.be.instanceOf(Mnemonic);

        expect(kr._mnemonic.phrase.split(' ').length).to.equal(12);
      });

      it('should not allow overwriting a key', function() {
        expect(function(){
          kr.generateDeterministicKey();
        }).to.throw(Error, 'Deterministic key already exists');
      });

    });

    describe('#_readDeterministicKey', function() {

      it('should decrypt and read deterministic key', function(done) {
        var tmp = tmpfolder();
        var kr = new KeyRing(tmp, 'password');
        kr.generateDeterministicKey();
        var oldMnemonic = kr._mnemonic;
        kr._mnemonic = null;
        kr._readDeterministicKey();
        expect(kr._mnemonic).to.eql(oldMnemonic);
        done();
      });

      it('should fail to decrypt', function() {
        var tmp = tmpfolder();
        var kr = new KeyRing(tmp, 'password');
        kr.generateDeterministicKey();

        expect(function() {
          var kr2 = new KeyRing(tmp, 'badpassword');
          kr2._readDeterministicKey();
        }).to.throw('Invalid passphrase was supplied to KeyRing');
      });

    });

    describe('#deleteDeterministicKey', function() {

      var tmp = tmpfolder();
      var deterministicKeyPath = path.join(
        tmp, 'key.ring', '.deterministic_key');

      var kr = new KeyRing(tmp, 'password');
      kr.generateDeterministicKey();

      it('should delete the deterministic Key', function() {
        expect(fs.existsSync(deterministicKeyPath)).to.equal(true);
        kr.deleteDeterministicKey();
        expect(fs.existsSync(deterministicKeyPath)).to.equal(false);
      });

    });

    describe('#exportMnemonic', function() {

      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'password');

      it('should return null when no key exists', function() {
        expect(kr.exportMnemonic()).to.equal(null);
      });

      it('should export 12 word mnemonic', function() {
        kr.generateDeterministicKey();
        expect(kr.exportMnemonic().split(' ').length).to.equal(12);
      });

    });

    describe('#importMnemonic', function() {

      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'password');

      it('should reject invalid mnemonic', function(done) {
        expect(function(){
          kr.importMnemonic('invalid mnemonic sentence');
        }).to.throw(Error, 'Mnemonic is invalid');
        done();
      });

      it('should import the mnemonic', function(done) {
        var mnemonic = 'lamp endorse image either ' +
          'benefit marriage junk empower ' +
          'bag blind divide stereo';
        kr.importMnemonic(mnemonic);
        expect(kr._mnemonic.phrase).to.equal(mnemonic);

        kr._mnemonic = '';
        kr._readDeterministicKey();
        expect(kr._mnemonic.phrase).to.equal(mnemonic);
        done();
      });

      it('should refuse to overwrite an exisitng mnemonic', function(done) {
        var newMnemonic = 'lamp lamp image either ' +
          'benefit marriage junk empower ' +
          'bag blind divide stereo';
        expect(function(){
          kr.importMnemonic(newMnemonic);
        }).to.throw(Error, 'Deterministic key already exists');
        done();
      });

    });

    describe('#generateBucketKey', function() {
      var sandbox = sinon.sandbox.create();
      afterEach(function() {
        sandbox.restore();
      });
      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'password');
      kr._mnemonic = new Mnemonic('abandon abandon abandon abandon abandon '+
                                  'abandon abandon abandon abandon abandon '+
                                  'abandon about');
      it('should generate the expected bucket key', function() {
        var bucketId = '0123456789ab0123456789ab';
        sandbox.spy(DeterministicKeyIv, 'getDeterministicKey');
        var bucketKey = kr.generateBucketKey(bucketId);

        expect(DeterministicKeyIv.getDeterministicKey.callCount).to.equal(1);
        expect(
          DeterministicKeyIv.getDeterministicKey.args[0][0].toString('hex')
        ).to.equal('5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f' +
                   '6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d' +
                   '48b2d2ce9e38e4');
        expect(bucketKey).to.equal('b2464469e364834ad21e24c64f637c39083af5067' +
                                   '693605c84e259447644f6f6');
      });

      it('should return null without mnemonic', function() {
        kr._mnemonic = null;
        var bucketId = '0123456789ab0123456789ab';
        var bucketKey = kr.generateBucketKey(bucketId);
        expect(bucketKey).to.equal(null);
      });

    });

    describe('#generateFileKey', function() {
      var tmp = tmpfolder();
      var kr = new KeyRing(tmp, 'password');
      kr._mnemonic = new Mnemonic('abandon abandon abandon abandon abandon '+
                                  'abandon abandon abandon abandon abandon '+
                                  'abandon about');
      it('should generate the expected file key', function() {
        var bucketId = '0123456789ab';
        var fileId = '0123456789ab';
        var fileKey = kr.generateFileKey(bucketId, fileId);
        var fileKeyPassString = fileKey._pass.toString('hex');
        expect(fileKeyPassString).to.equal('239596dd4de25d9e50c87e82ae401549c' +
                                           '4a75221cfdb32a952a6cdfa41462152');
      });

      it('should generate a random file key', function() {
        kr._mnemonic = null;
        var bucketId = '0123456789ab';
        var fileId = '0123456789ab';
        var fileKey = kr.generateFileKey(bucketId, fileId);
        var fileKeyStart = '10247c1d89170695ae7f1';
        var fileKeyPassString = fileKey._pass.toString('hex');
        expect(fileKeyPassString).to.not.equal(fileKeyStart);
      });

    });

  };

  testDeterministicKeys();

});
