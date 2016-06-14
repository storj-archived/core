var noop = function() {};
var crypto = {
  Cipheriv: {
    prototype: noop,
    apply: noop
  },
  Decipheriv: {
    prototype: noop,
    apply: noop
  }
};

module.exports = crypto;