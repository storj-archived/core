/**
 * @module storj
 * @license (AGPL-3.0 AND LGPL-3.0)
 */

'use strict';

require('./lib/patches')(); // NB: Apply any monkey patches

/** {@link Network} */
module.exports.Network = require('./lib/network');

/** {@link Monitor} */
module.exports.Monitor = require('./lib/network/monitor');

/** {@link Transport} */
module.exports.Transport = require('./lib/network/transport');

/** {@link Contact} */
module.exports.Contact = require('./lib/network/contact');

/** {@link ContactChecker} */
module.exports.ContactChecker = require('./lib/network/contact-checker');

/** {@link RateLimiter} */
module.exports.RateLimiter = require('./lib/network/rate-limiter');

/** {@link DataChannelClient} */
module.exports.DataChannelClient = require('./lib/data-channels/client');

/** {@link DataChannelServer} */
module.exports.DataChannelServer = require('./lib/data-channels/server');

/** {@link DataChannelPointer} */
module.exports.DataChannelPointer = require('./lib/data-channels/pointer');

/** {@link module:storj/datachannel/errors} */
module.exports.DataChannelErrors = require('./lib/data-channels/error-codes');

/** {@link Protocol} */
module.exports.Protocol = require('./lib/network/protocol');

/** {@link TunnelServer} */
module.exports.TunnelServer = require('./lib/tunnel/server');

/** {@link TunnelMuxer} */
module.exports.TunnelMuxer = require('./lib/tunnel/multiplexer');

/** {@link TunnelDemuxer} */
module.exports.TunnelDemuxer = require('./lib/tunnel/demultiplexer');

/** {@link module:storj/tunnel/errors} */
module.exports.TunnelErrors = require('./lib/tunnel/error-codes');

/** {@link TunnelClient} */
module.exports.TunnelClient = require('./lib/tunnel/client');

/** {@link EncryptStream} */
module.exports.EncryptStream = require('./lib/crypto-tools/encrypt-stream');

/** {@link DecryptStream} */
module.exports.DecryptStream = require('./lib/crypto-tools/decrypt-stream');

/** {@link FileMuxer} */
module.exports.FileMuxer = require('./lib/file-handling/file-muxer');

/** {@link FileDemuxer} */
module.exports.FileDemuxer = require('./lib/file-handling/file-demuxer');

/** {@link Padder} */
module.exports.Padder = require('./lib/file-handling/padder');

/** {@link Unpadder} */
module.exports.Unpadder = require('./lib/file-handling/unpadder');

/** {@link Contract} */
module.exports.Contract = require('./lib/contract');

/** {@link AuditStream} */
module.exports.AuditStream = require('./lib/audit-tools/audit-stream');

/** {@link ProofStream} */
module.exports.ProofStream = require('./lib/audit-tools/proof-stream');

/** {@link Verification} */
module.exports.Verification = require('./lib/audit-tools/verification');

/** {@link StorageManager} */
module.exports.StorageManager = require('./lib/storage/manager');

/** {@link StorageAdapter} */
module.exports.StorageAdapter = require('./lib/storage/adapter');

/** {@link StorageMigration} */
module.exports.StorageMigration = require('./lib/storage/migration');

/** {@link LevelDBStorageAdapter} */
module.exports.LevelDBStorageAdapter = require('./lib/storage/adapters/level');

/** {@link RAMStorageAdapter} */
module.exports.RAMStorageAdapter = require('./lib/storage/adapters/ram');

/** {@link StorageItem} */
module.exports.StorageItem = require('./lib/storage/item');

/** {@link DataCipherKeyIv} */
module.exports.DataCipherKeyIv = require('./lib/crypto-tools/cipher-key-iv');

/** {@link KeyPair} */
module.exports.KeyPair = require('./lib/crypto-tools/keypair');

/** {@link KeyRing} */
module.exports.KeyRing = require('./lib/crypto-tools/keyring');

/** {@link RenterInterface} */
module.exports.RenterInterface = require('./lib/network/interfaces/renter');

/** {@link FarmerInterface} */
module.exports.FarmerInterface = require('./lib/network/interfaces/farmer');

/** {@link TunnelerInterface} */
module.exports.TunnelerInterface = require('./lib/network/interfaces/tunneler');

/** {@link BridgeClient} */
module.exports.BridgeClient = require('./lib/bridge-client');

/** {@link module:storj/version} */
module.exports.version = require('./lib/version');

/** {@link module:storj/constants} */
module.exports.constants = require('./lib/constants');

/** {@link module:storj/utils} */
module.exports.utils = require('./lib/utils');

/** {@link module:storj/deps} */
module.exports.deps = require('./lib/deps');

/** {@link module:storj/sips} */
module.exports.sips = require('./lib/sips');
