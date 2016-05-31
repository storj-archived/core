Setting up a private or partitioned version of the Storj network is very simple.
The Storj protocol requires the inclusion of a `protocol` property nested
inside the `contact` data included in every RPC message. See
{@tutorial protocol-spec} for more information on the RPC message format.

### Protocol Identifier Format

Nodes on the Storj network identify the version of the protocol they are
running with the use of a [semantic version](http://semver.org/) tag. When a
node is trying to determine whether or not another node is compatible with her
version of the protocol, she checks the following:

* Is the `MAJOR` version the same?
* Is the `MAJOR` version `0`?
* Is the `MINOR` version the same?

If both nodes are running the *same* `MAJOR` version and that version is
**not** `0`, then the nodes are compatible. If the `MAJOR` version **is** `0`,
then the nodes are compatible *only* if the `MINOR` version is the same.

For example:

* `0.5.1` **is** compatible with `0.5.3`
* `0.5.1` **is not** compatible with `0.6.0`
* `1.5.1` **is** compatible with `1.13.0`
* `2.1.0` **is not** compatible with `1.13.0`

### Special Identifiers

The semantic versions specification also allows for special identifiers by
postfixing the version with a hyphen followed by some identifier. This is where
the network partitioning magic happens.

Let's say, for example, I work for "Widgets Ltd" and I want to deploy a Storj
network within the Widgets Ltd private network. Every workstation would run a
modified version of [`storj/farmer`](https://github.com/storj/farmer) or maybe
my own custom interface built atop `storj/core`.

I would simply change my Storj-based software to use the version
`1.5.0-widgetsltd`. The Storj protocol sees this identifies as a *strict* match
and therefore any nodes running this version of the software will only
communicate with nodes running the **exact** protocol identifier.

### Changing the Version

Changing the version in `storj/core` is easy as pie. In your code, simply
import the module and change the identifier like so:

```
// Import core library
var storj = require('storj');

// Modify protocol version
storj.version.protocol = '1.5.0-widgetsltd';

// Get on with your stuff...
```

If you are running "vanilla" Storj software, you can change the protocol
version by setting the `STORJ_NETWORK` environment variable. This will add a
postfix to the protocol version, which will partition the network to nodes
that are running that *exact* version:

```
STORJ_NETWORK=testnet storjshare --datadir /path/to/shards
```

This concept applies broadly to deploying a custom Storj network for any
purpose. This could be used for a public testnet (`x.x.x-testnet`) or for the
private network example above.
