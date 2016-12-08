Transfering file shards to farmers is a simple process. After a successful 
`CONSIGN` or `RETRIEVE` RPC yields a token, the renter may construct an HTTP 
request to the farmer, to push or pull the data.

#### Uploading Shards

To upload a shard to a given farmer, construct an HTTP request:

* Method: `POST`
* Path: `/shards/{hash}?token={token}`
* Headers:
  * `content-type: application/octet-stream`
  * `x-storj-node-id: {farmer node id}`

Then simply write the encrypted shard to the request. Farmers will respond with
appropriate status codes and messages to indicate the result.

#### Downloading Shards

To download a shard from a given farmer, construct an HTTP request:

* Method: `GET`
* Path: `/shards/{hash}?token={token}`
* Headers:
  * `content-type: application/octet-stream`
  * `x-storj-node-id: {farmer node id}`

You will receive the shard as a response of type `application/octet-stream` if 
you are authorized.
