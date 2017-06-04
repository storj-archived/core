storjd
======

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj-lib.svg?style=flat-square)](https://www.npmjs.com/package/storj-lib)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

Complete implementation of the Storj Network Protocol and daemon.

Prerequisites
-------------

Make sure you have the following prerequisites installed:

* Git
* Node.js LTS (6.9.x)
* NPM
* Python 2.7
* GCC/G++/Make

### Node.js + NPM

#### GNU+Linux & Mac OSX

```
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash
```

Close your shell and open an new one. Now that you can call the `nvm` program,
install Node.js (which comes with NPM):

```
nvm install --lts
```

#### Windows

Download [Node.js LTS](https://nodejs.org/en/download/) for Windows, launch the
installer and follow the setup instructions. Restart your PC, then test it from
the command prompt:

```
node --version
npm --version
```

### Build Dependencies

#### GNU+Linux

Debian / Ubuntu / Mint / Trisquel / and Friends

```
apt install git python build-essential
```

Red Hat / Fedora / CentOS

```
yum groupinstall 'Development Tools'
```

You might also find yourself lacking a C++11 compiler - 
[see this](http://hiltmon.com/blog/2015/08/09/c-plus-plus-11-on-centos-6-dot-6/).

#### Mac OSX

```
xcode-select --install
```

#### Windows

```
npm install --global windows-build-tools
```

Installation
------------

### Daemon + Utilities CLI

This package exposes two command line programs: `storjd` and `storjutil`. To 
install these, use the `--global` flag.

```
npm install storjd --global --production
```

### Core Library

This package exposes a module providing a complete implementation of the 
protocol. To use it in your project, from your project's root directory, 
install as a dependency.

```
npm install storjd --save
```

Usage
-----

### Control Interface

You can run `storjd` standalone and control it from any other application over 
its TCP control interface. See the _Resources_ section below to read up on the 
control protocol to implement it in the language of your choice. If using 
Node.js, you can use the client bundled in this package.

```js
const storj = require('storjd');
const controller = new storj.control.Client();

controller.on('ready', () => {
  // The control.Client instance implements the storj.Node interface!
  controller.ping(contact, (err) => { /* handle result */ });
});

controller.connect(port);
```

If you wish to control your `storjd` node from another language, simply connect 
to the control port over a TCP socket and use the 
[BOSCAR](https://github.com/bookchin/boscar) protocol to send RPC messages to 
the node. The methods and argument signatures map directly to the `storjd.Node` 
API describe in the documentation. See *Resources* below.

### Direct Implementation

Since `storjd` exposes all of the internals used to implement it, you can use 
the same classes to directly implement your own Storj node within your project.
Just import the `storjd` package and construct a node instance with options.

```js
const storj = require('storjd');
const node = new storj.Node(options);

node.listen(8443);
node.join(['known_node_id', { /* contact data */ }]);
```

Consult the documentation for a complete reference of the API exposed from the 
`Node` object. Further documentation on usage can be found by reviewing the 
end-to-end test suite in `test/node.e2e.js`. Note that this library is a very 
low level interface for the Storj protocol and is not intended for casual 
integration with the Storj network.

Resources
---------

* [Storj Core Documentation](https://storj.github.io/core/)
* [Storj Protocol Specification](https://raw.githubusercontent.com/Storj/core/master/doc/protocol.md)

License
-------

Storj Core - Complete implementation of the Storj Network Protocol and daemon.  
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
along with this program.  If not, see
[http://www.gnu.org/licenses/](http://www.gnu.org/licenses/).
