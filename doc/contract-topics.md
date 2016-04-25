Nodes solicit storage contracts with the network by publishing information
about their storage requirements as outlined in {@tutorial protocol-spec}.
Storj implements a distributed publish/subscribe system based on an algorithm
called [Quasar](https://github.com/kadtools/kad-quasar).

Quasar works by allowing nodes to advertise topics of interest to their
neighbors and keeping a record of these topics in their neighborhood by storing
them in an attenuated bloom filter. Each node has a view of the topics in which
their neighbors are interested up to 3 hops away. By the nature of this
design, the network forms gravity wells wherein messages of interest are
efficiently relayed to nodes that are subscribed to the topic without flooding
the network.

This approach works well when there is a diverse number of topics. The Storj
protocol leverages this by defining a matrix of *criteria* and *descriptors*
in the form of opcodes representing the degree of which the criteria must be
met.

### Criteria

At the time of writing, there are 4 criteria column in the topic matrix:

* Size
* Duration
* Availability
* Speed

#### Size

Refers to the size of the data to be stored.

#### Duration

Refers to the length of time for which the data should be stored.

#### Availability

Refers to the relative uptime of required by the contract for retrieval of the
stored data.

#### Speed

Refers to the throughput desired for retrieval of the stored data.

### Descriptors

At the time of writing, there are 3 descriptor opcodes representing *low*,
*medium*, and *high* degrees of the criteria.

* Low: `0x01`
* Medium: `0x02`
* High: `0x03`

The ranges represented by these descriptors are advisory and may change based
on network performance and improvements to hardware over time.

```
-------------------------------------------------------------------------------
| Descriptor      | Size        | Duration   | Availability | Speed           |
|-----------------|-------------|------------|--------------|-----------------|
| Low    (`0x01`) | 0mb - 8mb   | 0d - 30d   | 0% - 50%     | 0mbps - 6mbps   |
|-----------------|-------------|------------|--------------|-----------------|
| Medium (`0x02`) | 8mb - 16mb  | 30d - 90d  | 50% - 80%    | 6mbps - 12mbps  |
|-----------------|-------------|------------|--------------|-----------------|
| High   (`0x03`) | 16mb - 32mb | 90d - 270d | 80% - 99%    | 12mbps - 32mbps |
-------------------------------------------------------------------------------
```

### Topic Format

When publishing or subscribing to a given topic representing the degrees of
these criteria, nodes must serialize the opcodes as the hex representation of
the bytes in proper sequence. This sequence is defined as:

```
prefix|size|duration|availability|speed
```

The first byte, "prefix", is the **static identifier** for a contract
publication. Contracts are not the only type of publication shared in the
network, so the prefix acts as a namespace for a type of publication topic.

**The prefix for a contract publication is:** `0x0f`.

To illustrate by example, we can determine the proper topic by analyzing the
*use case* for a given file shard. For instance, if we want to store an asset
that is displayed on a web page we can infer the following:

* The file is small
* The file may change often, so we should only store it for medium duration
* The file needs to always be available
* The file should be transferred quickly

Using the matrix, we can determine the proper opcode sequence:

```
[0x0f, 0x01, 0x02, 0x03, 0x03]
```

Serialized as hex, our topic string becomes:

```
0f01020303
```

Another example, by contrast, is data *backup*. Data backup is quite different
than the previous example:

* The file is large (perhaps part of a hard drive backup)
* The file will not change and should be stored long term
* The file will not be accessed often, if ever
* The file does not need to be transferred at high speed

Using the matrix, we can determine the proper opcode sequence:

```
[0x0f, 0x03, 0x03, 0x01, 0x01]
```

Serialized as hex, our topic string becomes:

```
0f03030101
```

The resulting hex string from the serialized opcode byte sequence should be
used as the `topic` parameter of a `PUBLISH` RPC as defined in the
{@tutorial protocol-spec}. Nodes that are subscribed to the topic will receive
the proposed storage contract and may begin contract negotiation with you
directly.
