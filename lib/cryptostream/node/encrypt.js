var crypto = require('crypto');
var encrypt = require('../encrypt_factory')(crypto);
module.exports = encrypt;