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

TODO...

### Establishing a Tunnel

TODO...

### Connecting to a Tunnel

TODO...

### Handling Tunneled Messages

TODO...

### Tunneled Shard Transfer

TODO...
