#!/usr/bin/env node

'use strict';

const program = require('commander');
const options = require('./_config');

program.description('create daemon configuration files');
program.option('-l, --list-options', 'list all valid config options');
program.parse(process.argv);

if (program.listOptions) {
  for (let prop in options) {
    if (!['_', 'list-config-options'].includes(prop)) {
      console.log(prop);
    }
  }
}
