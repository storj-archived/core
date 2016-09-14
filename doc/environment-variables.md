Below is a list of environment variables that can be used to alter the
behavior of the core library and associated tooling.

#### `STORJ_NETWORK`

This value will be postfixed to your announced protocol version in the network.
A value of `testnet` would advertise to the network you are running
`0.7.0-testnet`, which will isolate you to other nodes running the same exact
version. See {@tutorial private-testnet} for more information.

#### `STORJ_ALLOW_LOOPBACK`

By default, the {@link Network} class will drop and ignore message from nodes
who identify themeselves as a loopback interface like `localhost`, `127.0.0.1`,
etc. This is a security precaution to prevent others from causing you to send
messages to yourself as well as prevent invalid contacts in your routing table.

To disable this feature (primarily for local testing), set this variable to `1`.

#### `STORJ_BRIDGE`

This variable will change the default URI for the {@link BridgeClient} class.
The default value is `https://api.storj.io`. If you run your own bridge,
testing one locally, or otherwise would like to default to a different host,
set this variable.

This works well with the CLI (see {@tutorial command-line-interface}) when
testing against other bridges.

#### `STORJ_KEYPASS`

This variable will set the `--keypass` used to unlock the keyring.

Setting your password will make it so other users can't grep it with `ps -a`.

#### `STORJ_TEMP`

This variable will set the folder to which the encrypted file will be placed
when uploading a file. Shards will also be placed in this folder during upload.
