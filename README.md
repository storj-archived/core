[![Storj](https://nodei.co/npm/storj-lib.png?downloads=true)](http://storj.github.io/core)
==========================================================================================

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj-lib.svg?style=flat-square)](https://www.npmjs.com/package/storj-lib)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

Implementation of the Storj protocol for Node.js. You must have Node.js v6.9.1, Python v2.x.x,
and Git installed. [Complete documentation can be found here](http://storj.github.io/core).

```
npm install storj-lib --save
```

Notices
-------
- The BridgeClient methods  `storeFileInBucket` and `resolveFileFromPointers` are deprecated, please see [node-libstorj](https://github.com/storj/node-libstorj) and [libstorj](https://github.com/Storj/libstorj) for file transfer, as well as the client libraries at https://github.com/Storj/awesome-storj#client-libraries

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
