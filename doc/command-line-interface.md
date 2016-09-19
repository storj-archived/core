This package comes equipped with a command line interface for performing a
number of useful operations on the Storj network. The CLI program is generally
focused on interacting with a remote [Bridge](https://github.com/Storj/bridge)
service and makes use of the library's {@link BridgeClient} class to do so. In
addition to interacting with a bridge node, the tool also exposes some general
purpose utilities.

To use the CLI, follow the instructions in the [README](https://github.com/Storj/core/blob/master/README.md) to install the module
**globally** or if you are working from within the git repository, you can use:

```
npm link
```

### Communicating with a Bridge

Once you have access to the `storj` command, register and authenticate with the
bridge:

```
> $ storj register
 [...]  > Enter your email address  >  gordon@storj.io
 [...]  > Enter your password  >  *************

 [info]   Registered! Check your email to activate your account.
```

Follow the activation link you receive via email and come back to the CLI to
pair with your account:

```
> $ storj login
 [...]  > Enter your email address  >  gordon@storj.io
 [...]  > Enter your password  >  *************

 [info]   This device has been successfully paired.
```

Now you can create buckets, transfer files, and manage your bridge account.

### Audits, Proofs, and Verifications

The CLI also includes some utility commands for generating file possession
audits, proving possession, and verifying proofs. You can generate a challenge
set and merkle tree for a file easily:

```
> $ storj prepare-audits 2 CONTRIBUTING.md
 [info]   Generating challenges and merkle tree...
 [info]
 [info]   Merkle Root
 [info]   -----------
 [info]   9c8c37935f58d46e3301efe4f44724b8785a81a5
 [info]
 [info]   Challenges
 [info]   ----------
 [info]   c8573773616e072230d40131e7ce8537d384825e337e5903ff7367ddea798c52
 [info]   7c4d4f57f40d5c95f962e7cd72347e4077e1885aaffd8c1ccbbd02c8d7c48dce
 [info]
 [info]   Merkle Leaves
 [info]   -------------
 [info]   aaf42766d87a37e6dffbae7172fd0073006bf5f3
 [info]   ccee086dbc8a16b93b79912cb37f3b037bbf8269
```

A farmer can use parts of this data to prove possession of a file shard:

```
> $ storj prove-file aaf42766d87a37e6dffbae7172fd0073006bf5f3,ccee086dbc8a16b93b79912cb37f3b037bbf8269 c8573773616e072230d40131e7ce8537d384825e337e5903ff7367ddea798c52 CONTRIBUTING.md
 [info]   Generating proof of possession...
 [info]
 [info]   Challenge Response
 [info]   ------------------
 [info]   [["153a0d4b1d228043992fec585cadb51974b053f7"],"ccee086dbc8a16b93b79912cb37f3b037bbf8269"]
```

The result of this operation can be used by the original renter to verify the
the proof and confirm that the farmer still has possession of the file:

```
> $ storj verify-proof 9c8c37935f58d46e3301efe4f44724b8785a81a5 2 '[["153a0d4b1d228043992fec585cadb51974b053f7"],"ccee086dbc8a16b93b79912cb37f3b037bbf8269"]'
 [info]
 [info]   Expected: 9c8c37935f58d46e3301efe4f44724b8785a81a5
 [info]   Actual:   9c8c37935f58d46e3301efe4f44724b8785a81a5
 [info]
 [info]   The proof response is valid
```

For more detailed usage information of the command line interface, run
`storj --help`.

### Temporary Files
On Windows temporary files are stored:

```
C:\Users\<user>\AppData\Local\Temp
```
