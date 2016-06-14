var crypto = require('./crypto_stub');
var encrypt = require('../encrypt_factory')(crypto);
module.exports = encrypt;