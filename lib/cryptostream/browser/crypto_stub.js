var noop = function() {};
var crypto = {
  Cipheriv: {
    prototype: noop
  },
  Decipheriv: {
    prototype: noop
  }
};

module.exports = crypto;