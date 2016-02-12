'use strict';

var ghpages = require('gh-pages');
var path = require('path');

ghpages.publish(path.join(__dirname, '../doc/out'), {
  repo: 'git@github.com:Storj/storjnode-js.git'
}, function(err) {
  console.log(err || 'Published to http://storj.github.io/storjnode-js');
});
