var crypto = require('crypto');
var decrypt = require('../decrypt_factory')(crypto);
module.exports = decrypt;