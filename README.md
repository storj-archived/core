[![Storj](https://nodei.co/npm/storj.png?downloads=true)](http://storj.github.io/core)
==============

[![Build Status](https://img.shields.io/travis/Storj/core.svg?style=flat-square)](https://travis-ci.org/Storj/core)
[![Coverage Status](https://img.shields.io/coveralls/Storj/core.svg?style=flat-square)](https://coveralls.io/r/Storj/core)
[![NPM](https://img.shields.io/npm/v/storj.svg?style=flat-square)](https://www.npmjs.com/package/storj)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/core/master/LICENSE)

This package exposes a module that provides all of the tools needed to
integrate with the Storj network. [Complete documentation can be found here](http://storj.github.io/core).

Prerequisites
-------------

* Node.js v4.x.x
* Git
* Python v2.x.x

### Installing on GNU/Linux & Mac OSX

Install Node.js and it's package manager NPM using Node Version Manager:

```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
```

> Detailed NVM installation instructions can be found [here](https://github.com/creationix/nvm#install-script).

After NVM is installed, source your `~/.bashrc`, `~/.profile`, or `~/.zshrc`
depending on your shell of choice:

```
source ~/.zshrc
```

Now that you can call the `nvm` program, install Node.js (which comes with NPM):

```
nvm install 4.4.4
```

> You'll also need to make sure you have a C++ compiler installed before
> proceeding to the next step. Debian based distributions can install the
> `build-essential` package using APT and Mac OSX users can install with
> `xcode-select --install` and follow the wizard.

### Installing on Windows (Manual)

Download [Node.js LTS](https://nodejs.org/en/download/) for Windows, launch the
installer and follow the setup instructions. Restart your PC, then test it from
the command prompt:

```
node --version
npm --version
```

Install the [latest version of Python 2.7](https://www.python.org/ftp/python/2.7.11/python-2.7.11.amd64.msi),
launch the installer and follow the instructions. To use Python from the shell
and add it to the system you have to add the path in "System Variables":

Navigate to:

```
Control Panel > System > Advanced System Settings > Environment Variables > System Variables > Path > Edit
```

Then add `;C:\Python27` or the installation path and test it in the command
prompt by running:

```
python -V
```

Next, install [Git](https://git-for-windows.github.io/) for your Windows
version. Then, install [Visual Studio Community 2015](https://www.visualstudio.com/)
and during the setup choose `Custom Installation > Programming Languages` and
select **Visual C++** and **Common Tools for Visual C++**.

Finally, set the new environment variable in the Windows command prompt with:

````
setx GYP_MSVS_VERSION 2015
```

### Installing on Windows (Automated)

Install utilizing automated script

<a href="https://github.com/Storj/storj-automation/archive/master.zip">https://github.com/Storj/storj-automation/archive/master.zip</a>

Run the `install.bat` located in `/Windows/storj-automate`

Quick Start (Programmatic)
--------------------------

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
  manager: storj.Manager(storj.LevelDBStorageAdapter('/path/to/datadir')),
  address: 'ip.or.hostname',
  port: 4000
});

network.join(/* callback */);
```

Quick Start (Command Line Interface)
------------------------------------

Install *globally* as user with NPM:

```
npm install storj --global
```

Use the linked command line interface:

```
storj --help
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
```
