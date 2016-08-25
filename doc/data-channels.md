Nodes on the Storj network implement a separate "data channel" for file
transfer. Each node must expose a
[WebSocket](https://tools.ietf.org/html/rfc6455) server that accepts connections
from clients who wish to use the channel for shard consignments and retrieval.

The WebSocket server must be accessible at the same path as the JSON-RPC server
and is negotiated by sending the `Sec-WebSocket-Key` header to indicate the
connection upgrade as defined by RFC6455. Once the WebSocket connection is
open, the client must send a JSON formatted message including the necessary
information for the farmer to authorize the data channel.

### Authorizing a Channel

The JSON message the client must provide to the farmer before establishing the
channel must contain the `token` provided from a previous `CONSIGN` or
`RETRIEVE` request, the `hash` of the data being transferred, and the
`operation` (either `PUSH` or `PULL`).

```
{
  "token": "5a7ac2dd58377085bad57f864b3a493c288b7c07",
  "hash": "ba084d3f143f2896809d3f1d7dffed472b39d8de",
  "operation": "PUSH"
}
```

> Authorization message frames must use opcode `0x1` (textual).

The receiving farmer must check that she issued the received `token` within a
reasonable amount of time (recommend 10 minutes) and that the supplied `hash` is
associated with that token before sending or receiving any other data.

If the authorization fails, the farmer must close the data channel, optionally
responding with a status message.

### Status Codes

Farmers can communicate the result of an operation by sending back a special
status code and message when closing the connection.

* `NORMAL`: 1000
* `UNEXPECTED`: 1011
* `INVALID_MESSAGE`: 3100
* `UNAUTHORIZED_TOKEN`: 3101
* `FAILED_INTEGRITY`: 3102
* `INVALID_OPERATION`: 3103

### Consigning a Shard

To consign a shard (to upload the shard to a farmer), first send the
appropriate authorization message. If the farmer does not respond with a failed
status message, the channel is open and you can begin sending binary frames.

Farmers must track the amount of data received and ensure that it does not
exceed the amount defined in the contract. Once the farmer has received the
number of bytes defined in the contract, she must verify the data against the
hash defined in the contract.

If these checks are successfully executed, then the farmer must respond with a
positive status message and terminate the channel.

> Shard message frames must use opcode `0x2` (binary).

#### Example (browser-based)

```
var channel = new WebSocket('<farmer_uri>');

channel.addEventListener('open', function() {
  channel.send(JSON.stringify({
    token: '<token>',
    hash: '<hash>',
    operation: 'PUSH'
  });

  channel.send(new Blob([/* ... */]));
});

channel.addEventListener('close', function(e) {
  if (e.code !== 1000) {
    console.error('Error consigning data:', e.reason);
  } else {
    console.log('Successfully consigned data!');
  }
});
```

### Retrieving a Shard

To retrieve a shard from a farmer, first send the appropriate authorization
message. The farmer will respond with a negative status message frame if you
are not authorized and terminate the channel. If authorization is successful,
you will immediately begin receiving binary message frames until there is no
more data to be transferred - at which point the farmer must terminate the
channel.

> Shard message frames must use opcode `0x2` (binary).

#### Example (browser-based)

```
var channel = new WebSocket('<farmer_uri>');
var fileparts = [];

channel.addEventListener('open', function() {
  channel.send(JSON.stringify({
    token: '<token>',
    hash: '<hash>',
    operation: 'PULL'
  });
});

channel.addEventListener('message', function(e) {
  fileparts.push(e.data);
});

channel.addEventListener('close', function(e) {
  if (e.code !== 1000) {
    console.error(e.reason);
  } else {
    var file = new Blob(fileparts, { type: '<mime_type>' });
    var url = URL.createObjectURL(file);

    location.href = url;
  }
});
```

### File Reconstruction

In most cases a complete file is consigned to a number of different farmers. To
reconstruct a file, you'll need to know the location of each shard and the
concatenation order. With this information, you can open data channels to each
of the farmers storing the file's shards (with whatever degree of parallelism
suits your needs) and concatenate the binary blobs received in the proper order.
