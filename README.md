[![Storj](https://avatars3.githubusercontent.com/u/6308081?v=3&s=200)](http://storj.github.io/core)
==============

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj.svg?style=flat-square)](https://www.npmjs.com/package/storj)
[![GitHub license](https://img.shields.io/badge/license-AGPLv3-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

This package exposes a module that provides all of the tools needed to
integrate with the Storj network. [Complete documentation can be found here](http://storj.github.io/core).

Quick Start
-----------

Install *locally* as user with NPM:

```
npm install storj --save
```

Import the `storj` module, generate a key pair, configure your persistence
layer, and join the network in just a few lines of code:

```
var storj = require('storj');

var network = storj.Network({
  keypair: storj.KeyPair(/* existing_key */),
  manager: storj.Manager(storj.FSStorageAdapter('/path/to/datadir')),
  address: 'ip.or.hostname',
  port: 4000,
  seeds: [
    'storj://api.storj.io:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052'
  ]
});

network.join(/* callback */);
```

License
-------

```
Storj Core - Implementation of the Storj protocol for Node.js
Copyright (C) 2016  Storj Labs, Inc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.


