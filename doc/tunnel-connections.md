One of the most daunting problems to tackle when designing a stable and
reliable distributed network is the traversal of various constraints such as
NAT and firewalls. In some cases, software can use various strategies to
"punch out" of these constraints and become publicly addressable on the
Internet. The StorjCORE library makes use of these strategies, but when they
fail we must devise more complex tactics for ensuring that network participants
are reachable by their peers.

The Storj protocol defines a series of RPC messages that can be exchanged
in order to establish a "tunnel". See the {@tutorial protocol-spec} for more
detail on these RPC messages and their purposes. A tunnel is, in essence, a
proxy that allows a client that is not exposed to the Internet to be
addressable as if it were.

This works by a private node opening a long-lived connection to a public node
who establishes a dedicated means for accepting messages on behalf of the
private node and "pipes" any data received via those means directly back to the
private node over the previously established connection.

Once a tunnel has been established, the private node can begin identifying
herself to the network using her tunnel's address, instead of her own. Private
nodes do not need to use the tunnel to contact other nodes on the network, but
rather only *to be contacted*.

### Tunneling Diagram
![tunneling.png](tunneling.png)

### Announcing Willingness

When a node joins the network and is publicly addressable, it has the ability
to announce to the network that it is willing and capable of tunneling
connections on behalf on nodes who are private or unable to punch out to
become addressable on the Internet. The process of doing this uses the same
publish/subscribe system described in the {@tutorial contract-topics}
specification which enables nodes to maintain a view of subscriptions in their
neighborhood of the network as described in the {@tutorial protocol-spec}.

The difference between a contract publication and a tunnel announcement is in
the opcode used for the topic and in the contents of the publication. Tunnel
announcement publications use the opcode prefix `0x0e` followed by a single
criteria degree opcode to indicate their willingness to tunnel (`0x00` to
indicate "I am no longer tunneling" and `0x01` to indicate "I am ready to
tunnel").

Whenever the condition changes, such as a node's maximum number of tunnels is
reached or when a tunnel becomes available, it should issue a `PUBLISH` RPC
message to it's nearest neighbors.

```
{
  "method": "PUBLISH",
  "params": {
    "uuid": "7f0c40a2-e465-4f3e-b617-3d53460e34f7",
    "topic": "0e01",
    "contents": {
      "address": "10.0.0.2",
      "port": 1337
    },
    "publishers": [
      "48dc026fa01ae26822bfb23f98e725444d6775b0"
    ],
    "ttl": 1455228597837,
    "contact": {
      "address": "10.0.0.2",
      "port": 1337,
      "nodeID": "48dc026fa01ae26822bfb23f98e725444d6775b0",
      "protocol": "0.6.0"
    },
    "nonce": 1455216323786,
    "signature": "304502207e8a439f2cb33055e0b2e2d90e775f29d90b3ad85aec0c..."
  },
  "id": "7b6a2ab35da6826995abf3310a4875097df88cdb"
}
```

Public nodes should subscribe to these topics so that they can maintain an
up-to-date list of nodes who are capable and willing to tunnel connections, so
they can respond accurately to `FIND_TUNNEL` messages from private nodes.

### Establishing a Tunnel

After a private node has discovered some willing tunnels using the `FIND_TUNNEL`
RPC message defined in the {@tutorial protocol-spec}, it can now begin the
handshake to establish the tunnel. This begins by sending the `OPEN_TUNNEL` RPC
message to the desired tunneler node. The recipient of `OPEN_TUNNEL` will
check:

* Do I have enough remaining tunnels? (based on arbitrary limit set by node)
* Am I already tunneling for this nodeID?
* Has a payment channel been opened? (**future spec**)

If the tunneling node has enough tunnels, is not already tunneling the node,
and (in a future spec) if a payment channel has been opened for bandwidth, then
the tunneling node opens a new dedicated HTTP/WS server on an available port
that will be used by the requester as it's "contact" information included in
RPC messages.

Before responding to the `OPEN_TUNNEL` RPC, the tunneler must also generate a
unique authorization token that will be appended to the query string of it's
tunnel entry point and provided back to the requester.

```
{
  "result": {
    "tunnel": "ws://10.0.0.3:1337/tun?token=2bfb23f98e72",
    "alias": {
      "address": "10.0.0.3",
      "port": 1338
    },
    "contact": {
      "address": "10.0.0.3",
      "port": 1337,
      "nodeID": "48dc026fa01ae26822bfb23f98e725444d6775b0",
      "protocol": "0.6.0"
    },
    "nonce": 1455216323786,
    "signature": "304502207e8a439f2cb33055e0b2e2d90e775f29d90b3ad85aec0c..."
  },
  "id": "7b6a2ab35da6826995abf3310a4875097df88cdb"
}
```

Now the private node can connect to the `tunnel` URI provided and receive any
messages sent to the `alias` contact information.

### Connecting to a Tunnel

Once the `OPEN_TUNNEL` handshake is completed, the private node can establish
a WebSocket connection to the tunneler, providing the `token` in the request's
query string.

#### Example (browser-based)

```
var tunnel = new WebSocket('ws://10.0.0.3:1337/tun?token=2bfb23f98e72');

tunnel.addEventListener('open', function() {
  console.log('Tunnel established!');
});

tunnel.addEventListener('message', function(e) {
  console.log('Received tunneled message:', e.data);
  // Handle tunneled message here...
});
```

### Handling Tunneled Messages

Once the WebSocket tunnel has been opened and authorized, both the private node
and the tunneling node have a bidirectional communication channel. RPC messages
received by the tunnel to the dedicated entry point will be written to the
tunnel and must be handled by the private node. RPC messages are sent with the
WebSocket opcode `0x2` (binary) and must be parsed by the private node and
then handled as if it were received directly.

The binary chunk representing the RPC message must be prefixed with a special
opcode (`0x0c`) indicating that it should be demuxed and handled as an RPC
message.

Once the tunneled message has been appropriately handled, the private node can
instruct the tunnel to respond to the request by simply writing it's response
message back to the tunnel using the same WebSocket opcode `0x2` (binary) with
the appropriate `0x0c` prefix. The tunneling node must parse the message and
issue a response back to the originator of the message.

### Tunneled Shard Transfer

Transferring file shards through a tunnel is also carried out transparently
from the perspective of the remote node. The remote node will negotiate a data
channel via the appropriate RPC messages sent to the destination through the
tunnel and use the resulting `token` and `hash` to open a data channel with the
tunneler. The tunneler will use the existing WebSocket tunnel to it's private
node to indicate the intent to establish a data channel by sending a special
message called a **"signal"**.

The `SIGNAL` message indicates to the private node's tunnel client that the
tunnel server has established a data channel on it's behalf and will begin
sending the received frames to the tunnel client. The `SIGNAL` message will
simply include a unique identifier for the client to use for mux/demuxing
subsequent frames in the case of multiple concurrent tunneled data channels.

A `SIGNAL` message uses the WebSocket opcode `0x2` (binary), and prefixes the
contained data with it's own opcode `0x0d`. The prefix is followed by the
WebSocket opcode sent by the originator to the tunnel server, which is followed
by a quasi-unique 6 byte identifier assigned to the originator. For example, a
tunnel client might receive a chunk of data that says "hello world" as part of
a `CONSIGN` data channel:

```
<Buffer 0d 02 9d b4 a0 58 5f 31 68 65 6c 6c 6f 20 77 6f 72 6c 64>
```

In the above byte array, `0d` indicates that this is a data channel signal,
`02` indicates that the originator sent this data to the tunnel as binary,
`9d b4 a0 58 5f 31` is the quasi-unique identifier for the originator so the
client can demux the stream, and `68 65 6c 6c 6f 20 77 6f 72 6c 64` is the
binary payload (in this case, "hello world").

When a tunnel client receives a `SIGNAL` message like this, it should check to
see if it has already opened a local WebSocket connection to it's own data
channel server. If it has not, it must open one using the quasi-unique
identifier to track it, and writing any data in the signal to the socket using
the WebSocket opcode included in the signal.

The data channel server will also write back to the local WebSocket opened by
the tunnel client, which is responsible for converting the data into the
appropriate signal format and write the result back to the tunnel server. The
tunnel server must then use the signal metadata to multiplex the streams out to
their respective data channel originators.

### Reference

* {@link TunnelClient}
* {@link TunnelServer}
* {@link TunnelMuxer}
* {@link TunnelDemuxer}
* {@link DataChannelClient}
* {@link DataChannelServer}
