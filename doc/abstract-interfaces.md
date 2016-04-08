The `storj.abstract` module provides a collection of abstract interfaces for
implementing common use cases.

### Farmer

Use the `FarmerFactory` to create a farmer from configuration:

```
var storj = require('storj');
var factory = new storj.abstract.FarmerFactory();

factory.create(config, function(err, farmer) {
  // NB: The `farmer` object contains three properties:
  // NB:   * node     - {storj.Network}          Storj network Interface
  // NB:   * logger   - {ReadableStream}         Newline terminated JSON stream
  // NB:   * reporter - {TelemetryReporter|null} Send usage statistics for beta
});
```

#### Configuration

The {@link FarmerFactory#create} method accepts a dictionary with the following
accepted properties:

* `{String} key` - ECDSA private key for farmer node
* `{String} address` - BTC payment address
* `{String} storage.path` - File system path to store data
* `{Number} storage.size` - Storage size to allocate
* `{String} storage.unit` - Storage size unit (MB|GB|TB)
* `{String} network.address` - Optional network address to bind to
* `{Array} network.seeds`   - Optional Storj URIs to connect to
* `{Array} network.opcodes` - Optional contract opcodes to farm
* `{Array} network.version` - Optional protocol version override
* `{Boolean} network.forward` - Try NAT traversal strategies
