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
the tunneling node opens a new dedicated TCP socket on an available port
that will be used by the requester to send/receive HTTP messages.

```
{
  "result": {
    "proxyPort": 12000,
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

Now the private node can open a TCP connect to the `proxyPort` provided and
messages sent to the tunneler that specify your node ID in the 
`x-storj-node-id` header will be written to the connected socket. From there, 
you may pipe this socket directly to your locally running node.
