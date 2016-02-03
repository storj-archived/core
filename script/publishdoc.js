'use strict';

var ghpages = require('gh-pages');
var path = require('path');

ghpages.publish(path.join(__dirname, 'doc'), function(err) {
  console.log(err || 'Documentation published!');
});
