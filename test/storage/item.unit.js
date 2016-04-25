'use strict';

var expect = require('chai').expect;
var StorageItem = require('../../lib/storage/item');

describe('StorageItem', function() {

  describe('@constructor', function() {

    it('should create an instance without the new keyword', function() {
      expect(StorageItem()).to.be.instanceOf(StorageItem);
    });

  });

});
