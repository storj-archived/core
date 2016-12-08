This tutorial covers the process for using StorjCORE to rent data to farmers on
the network programmatically using a number of tools included in the library.
This walkthrough should also serve as an overview for a number of the tools
included in the library and how they work together.

### Bootstrapping

Before we can join the network, we need to set up a few required components:

* {@link KeyPair} - for representing our identity on the network
* {@link StorageAdapter} - for persisting our contracts and shard metadata
* {@link StorageManager} - for managing our persistence layer

Start by importing the `storj` module and instantiating these objects:

```
var storj = require('storj');
var keypair = new storj.KeyPair();
var persistence = new storj.EmbeddedStorageAdapter('/path/to/datadir');
var manager = new storj.StorageManager(persistence);
```

Now that we have a way of identifying ourselves to the network and keeping a
record of our contracts, we can use the {@link RenterInterface} to join the
network.

```
var renter = new storj.RenterInterface({
  keyPair: keypair,
  storageManager: manager,
  rpcAddress: 'ip.or.hostname',
  rpcPort: 1337
});

renter.join(function(err) {
  if (err) {
    return console.error('Failed to join the network');
  }

  // CONTINUED IN NEXT EXAMPLE...
});
```

### File Preparation

Now that we have a connection to the network, we are ready to store some data.
Before we can actually store the data, we need to get some information about
the shards we need to store. We need to know:

* The hash of each shard that will be stored
* The size of each shard that will be stored
* The length of time we wish to store the data
* The number of audits we intend to issue over the life of the contract

To get this information we need to process the file using a few more of the
core components:

* {@link FileDemuxer} - for breaking the file into shards
* {@link DataCipherKeyIv} - for generating encryption key
* {@link EncryptStream} - for encrypting the shards
* {@link Contract} - for constructing the terms of the storage

We will start by demultiplexing the file into several shard streams. Let's
break our file into 6 shards. We will start by creating a {@link FileDemuxer}:

```
var demuxer = new storj.FileDemuxer('/path/to/file');
```

Now that we have prepared to shard a file, we need to set up event listeners on
the demuxer for whenever a new shard stream is available. Once a shard stream
is available, we need to encrypt it and calculate it's hash and size so we can
create an appropriate {@link Contract} to offer the network. In addition we
will write the encrypted shard to temporary storage so we don't have to process
the file again when we are ready to transfer the data:

```
var tmpdir = require('os').tmpdir();
var crypto = require('crypto');
var path = require('path');

demuxer.on('shard', function(shardStream) {
  var tmpName = path.join(tmpdir, crypto.randomBytes(6).toString('hex'));
  var tmpFile = fs.createWriteStream(tmpName);
  var key = new storj.DataCipherKeyIv('password', 'salt');
  var encrypter = new storj.EncryptStream(key);
  var hasher = crypto.createHash('sha256');
  var size = 0;

  encrypter.on('data', function(bytes) {
    hasher.update(bytes);
    size += bytes.length;
  });

  tmpFile.on('finish', function() {
    // CONTINUED IN NEXT EXAMPLE...
  });

  shardStream.pipe(encrypter).pipe(tmpFile);
});
```

### Contract Negotiation

When each shard is finished being encrypted and we know it's size and hash, it
is time to create a {@link Contract} and offer it to the network. The example
below is continued from inside the `tmpFile.on('finish', callback)` in the
example above:

```
var hash = utils.rmd160sha256(hasher.digest());
var contract = new storj.Contract({
  renter_id: keypair.getNodeID(),
  data_size: size,
  data_hash: hash,
  store_begin: Date.now(),
  store_end: Date.now() + 604800000, // 7 days from now
  audit_count: 12
});

renter.getStorageOffer(contract, function(err, farmer, contract) {
  // CONTINUED IN NEXT EXAMPLE...
});
```

Now we have created a {@link Contract} for the shard and we are waiting for an
offer from a farmer on the network. When we receive one, the callback supplied
to {@link RenterInterface#getStorageOffer} above will trigger and we can
proceed to transfer the shard to the farmer, but first we need to tell the
farmer we are ready to transfer the shard to them and include the audit
information they will need in the future. We will be using:

* {@link AuditStream} - for generating audit challenges and merkle tree
* {@link StorageItem} - for storing our private record of challenges

Let's continue by reading the encrypted shard temporary file we just created
and generating the challenges and merkle tree and saving a copy of the contract
and associated challenges:

```
var item = new storj.StorageItem({ hash: hash });
var auditGenerator = new storj.AuditStream(12);
var encryptedShard = fs.createReadStream(tmpName);

auditGenerator.on('finish', function() {
  item.addContract(farmer, contract);
  item.addAuditRecords(farmer, auditGenerator);

  manager.save(item, function(err) {
    if (err) {
      return console.error(err);
    }

    // CONTINUED IN NEXT EXAMPLE...
  });
});

encryptedShard.pipe(auditGenerator);
```

### Transferring Shards

Now that we have stored a copy of our contract and challenges, it's time to
authorize a "data channel" (as described in {@tutorial data-channels}) and
transfer the shard to the farmer.

```
renter.getConsignToken(farmer, contract, auditGenerator, function(err, token) {
  if (err) {
    return console.error(err);
  }

  var upload = storj.utils.createShardUploader(farmer, hash, token);
  var encryptedShard = fs.createReadStream(tmpName);

  encryptedShard.pipe(upload).on('end', () => {
    // CONTINUED IN THE NEXT EXAMPLE
  });
});
```

Remember that these operations for contract negotiation and shard transfer are
taking place for **each** shard in the original file. You'll want to keep track
of shards and their associated contracts by grouping references to them
logically as the **file** that they compose. This is the responsibility of
implementing clients. If you do not wish to manage this yourself, consider
running a [Bridge](https://github.com/storj/bridge) or using the
[Storj API](https://storj.io).

### Replicating Shards for Redundancy

Once we have successfully consigned our data to a farmer, we can ensure that in
the event that farmer disappears, our data can be recovered from elsewhere. We
use mirrors to accomplish this. Mirroring is a method for *passively*
replicating our data, meaning that instead of uploading it again, we instruct a
new farmer to retrieve it from the location we already stored it.


> We are also going to use the [async](https://github.com/caolan/async) module
> for managing flow control.

First we'll need to negotiate a few more contracts, then authorize some
retrieval tokens (outlined later in this document), and finally request some
mirrors.

```
var redundancy = 3;
var mirrors = [];

function _getMirroringContract(n, next) {
  renter.getStorageOffer(contract, function(err, mirror, contract) {
    renter.getRetrieveToken(farmer, contract, function(err, token) {
      if (err) {
        return next(err);
      }

      mirrors.push(mirror);
      next(null, { farmer: farmer, hash: hash, token: token });
    });
  });
}

async.timesSeries(redundancy, _getMirroringContract, function(err, sources) {
  if (err) {
    return console.error(err);
  }

  renter.getMirrorNodes(sources, mirrors, function(err, completed) {
    if (err) {
      return console.error('Failed to replicate to all mirrors');
    }

    console.info('Replicated to %s mirrors', completed.length);
  });
});
```

### Auditing Farmer Storage

Now that we have successfully consigned a shard, we will want to be sure that
the farmer is being honest about storing it. We can verify this by requesting
a proof using the challenges we generated previously. We will be using:

* {@link Verification} - for validating the farmer's challenge response

```
var merkleRoot = auditGenerator.getPrivateRecord().root;
var treeDepth = auditGenerator.getPrivateRecord().depth;

renter.getStorageProof(farmer, item, function(err, proof) {
  if (err) {
    return console.error(err);
  }

  var verification = new storj.Verification(proof);
  var verifyResult = verification.verify(merkleRoot, treeDepth);

  if (verifyResult[0] !== verifyResult[1]) {
    return console.error('The proof is not valid');
  }

  manager.save(item, function(err) {
    if (err) {
      return console.error(err);
    }

    // CONTINUED IN NEXT EXAMPLE
  });
});
```

### Retrieving Shards

Now that we have verified that the farmer is storing the shard, we know that we
can later retrieve it when needed. The process for doing this is very similar
to the process for storing the shard, only this time we'll be asking for a
retrieval token and we will be receiving data over the data channel instead of
sending. We'll also be using:

* {@link DecryptStream} - for decrypting the shard stream

```
renter.getRetrieveToken(farmer, contract, function(err, token) {
  if (err) {
    return console.error(err);
  }

  var download = utils.createShardDownloader(farmer, hash, token);
  var decrypter = new storj.DecryptStream(keypair);
  var fileDestination = fs.createWriteStream('/path/to/download/shard');

  download.pipe(decrypter).pipe(fileDestination);

  fileDestination.on('finish', function() {
    console.info('Successfully downloaded shard!');
  });
});
```

This concludes the tutorial. To dive deeper, follow the reference links
throughout this walkthrough and read the documentation on each of the classes
used here.
