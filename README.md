Storj Core Library
==================

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj-lib.svg?style=flat-square)](https://www.npmjs.com/package/storj-lib)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

Complete implementation of the Storj Network Protocol for Node.js. 

Installation
------------

From your project's directory, install `storj-lib` as a dependency.

```
npm install storj-lib --save
```

Usage
-----

Import the `storj-lib` package and construct a node instance with options.

```js
const storj = require('storj-lib');
const node = new storj.Node(options);

node.listen(8443);
```

Subscribe to contract/shard descriptors to farm data.

```js
node.subscribeShardDescriptor(['02010202'], (err, stream) => {
  if (err) {
    return console.error(err);
  }

  stream.on('data', ([contract, renter]) => {
    contract.set('farmer_id', node.identity.toString('hex'));
    contract.set('farmer_hd_key', node.contact.xpub);
    contract.set('farmer_hd_index', node.contact.index);
    contact.sign('farmer', node.spartacus.privateKey);
    node.offerShardAllocation(renter, contract.toObject(), callback);
  });
});
```

Publish contract/shard descriptors to rent data.

```js
node.publishShardDescriptor(descriptor, (err, stream) => {
  if (err) {
    return console.error(err);
  }

  stream.on('data', (offer) => {
    offer.contract.sign(node.spartacus.privateKey);
    offer.callback(null, offer.contract);
    node.authorizeConsignment(
      offer.contact, 
      offer.contract.get('data_hash'),
      (err, [transferToken]) => {
        console.info('Ready to transfer shard!');
      }
    ;)
  });
});
```

Resources
---------

* [Storj Core Documentation](https://storj.github.io/core/)
* [Storj Protocol Specification](https://raw.githubusercontent.com/Storj/core/master/doc/protocol.pdf)

License
-------

Storj Core - Implementation of the Storj protocol for Node.js
Copyright (C) 2016  Storj Labs, Inc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

*Certain parts of this program are licensed under the GNU Lesser General
Public License as published by the Free Software Foundation. You can
redistribute it and/or modify it under the terms either version 3 of the
License, or (at your option) any later version.*

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see
[http://www.gnu.org/licenses/](http://www.gnu.org/licenses/).
