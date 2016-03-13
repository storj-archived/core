Storj JS
========

[![Build Status](https://img.shields.io/travis/Storj/node-storj.svg?style=flat-square)](https://travis-ci.org/Storj/node-storj)
[![Coverage Status](https://img.shields.io/coveralls/Storj/node-storj.svg?style=flat-square)](https://coveralls.io/r/Storj/node-storj)
[![NPM](https://img.shields.io/npm/v/storj.svg?style=flat-square)](https://www.npmjs.com/package/storj)

---

This package exposes a module that provides all of the tools needed to
integrate with the Storj network.

[**Complete documentation can be found here.**](http://storj.github.io/node-storj/)

Quick Start
-----------

Install Wget:

```
apt-get install wget
```

Install NVM, Node.js and NPM:

```
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.30.1/install.sh | bash
source ~/.profile
nvm install 4.2.3
```

### Using the Command Line Interface

Install *globally* as user with NPM:

```
npm install storj --global
```

Install *globally* as root with NPM:

```
npm install storj --global --unsafe-perm
```

### Using the Library

Install *locally* as user with NPM:

```
npm install storj --save
```

Install *locally* as root with NPM:

```
npm install storj --unsafe-perm --save
```

Import the `storj` module, generate a key pair, configure your persistence
layer, and join the network in just a few lines of code:

```
var storj = require('storj');

var keypair = new storj.KeyPair(/* existing_key */);
var store = new storj.FSStorageAdapter('/path/to/datadir');
var manager = new storj.Manager(store);

var network = new storj.Network({
  keypair: keypair,
  manager: manager,
  contact: {
    address: 'ip.or.hostname',
    port: 4000
  },
  seeds: [
    'storj://api.metadisk.org:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052'
  ],
  loglevel: 3,
  datadir: '/path/to/datadir',
  farmer: false
});

network.join(function(err) {
  if (err) {
    return console.log('Failed to join network, reason: %s', err.message);
  }

  console.log('Connected to the Storj network!');
});
```

Once you are connected to the network, you can store, audit, and retrieve
arbitrary data shards.

License
-------

Storj JS - Implementation of the Storj protocol for Node.js
Copyright (C) 2016  Storj Labs, Inc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
