'use strict';

var expect = require('chai').expect;
var utils = require('../lib/utils');

describe('utils', function() {

  describe('#getNodeIDFromPublicKey', function() {

    it('should work with a string', function() {
      expect(utils.getNodeIDFromPublicKey(
        '03a7b4f7e7364f33e6b6c5c215e75d7a6dd08515fe9064fa8ec26726d6db9a5dce'
      )).to.equal('1694cKqpJPEH7AY8YEdnUoQ5sGMsuK3PNs');
    });

    it('should work with a buffer', function() {
      expect(utils.getNodeIDFromPublicKey(Buffer(
        '03a7b4f7e7364f33e6b6c5c215e75d7a6dd08515fe9064fa8ec26726d6db9a5dce',
        'hex'
      ))).to.equal('1694cKqpJPEH7AY8YEdnUoQ5sGMsuK3PNs');
    });

  });

});
