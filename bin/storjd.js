#!/usr/bin/env node

'use strict';

const program = require('commander');
const storj = require('..');


program.version(`
  core      ${storj.version.software}
  protocol  ${storj.version.protocol}
`);

program.description('run a storj node and control it from any application');
program.command('daemon', 'start a storj node daemon', { isDefault: true });
program.command('keygen', 'generate various identity keys');
program.command('config', 'create daemon configuration files');
program.parse(process.argv);
