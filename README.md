[![Storj](https://nodei.co/npm/storj-lib.png?downloads=true)](http://storj.github.io/core)
==========================================================================================

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj-lib.svg?style=flat-square)](https://www.npmjs.com/package/storj-lib)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

This package exposes a module that provides all of the tools needed to
integrate with the Storj network. You must have Node.js v6.9.1, Python v2.x.x,
and Git installed. [Complete documentation can be found here](http://storj.github.io/core).

```
npm install storj-lib --save
```

> If you want access to the [Storj CLI](https://github.com/storj/core-cli), 
> you must install it separately or use the [`storj`](https://github.com/storj/npm-meta) 
> metapackage to install both the core library *and* command line interface.

Usage Examples
--------------

- [Example 1 - Creating a User](https://github.com/Storj/core/blob/master/example/1-create-user.js)
- [Example 2 - Generating a KeyPair](https://github.com/Storj/core/blob/master/example/2-generate-keypair.js)
- [Example 3 - Authenticating with a KeyPair](https://github.com/Storj/core/blob/master/example/3-authenticate-with-keypair.js)
- [Example 4 - Listing Keys](https://github.com/Storj/core/blob/master/example/4a-list-keys.js)
- [Example 4b - Add/Remove Keys](https://github.com/Storj/core/blob/master/example/4b-add-remove-keys.js)
- [Example 5a - List Buckets](https://github.com/Storj/core/blob/master/example/5a-list-buckets.js)
- [Example 5b - Add/Remove Bucket](https://github.com/Storj/core/blob/master/example/5b-add-remove-bucket.js)
- [Example 6a - Upload File](https://github.com/Storj/core/blob/master/example/6a-upload-file.js)
- [Example 6b - Download File](https://github.com/Storj/core/blob/master/example/6b-download-file.js)
- [Example 6c - List Bucket Files](https://github.com/Storj/core/blob/master/example/6c-list-bucket-files.js)
- [Example 6d - Delete File from Bucket](https://github.com/Storj/core/blob/master/example/6d-delete-file-from-bucket.js)

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
