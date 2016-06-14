var crypto = require('./crypto_stub');
var decrypt = require('../decrypt_factory')(crypto);
module.exports = decrypt;