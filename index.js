/**
 * @module storj
 * @license (AGPL-3.0 AND LGPL-3.0)
 */

'use strict';

require('./lib/patches')(); // NB: Apply any monkey patches

/** {@link Network} */
exports.Network = require('./lib/network');

/** {@link Monitor} */
exports.Monitor = require('./lib/network/monitor');

/** {@link Transport} */
exports.Transport = require('./lib/network/transport');

/** {@link Contact} */
exports.Contact = require('./lib/network/contact');

/** {@link ContactChecker} */
exports.ContactChecker = require('./lib/network/contact-checker');

/** {@link RateLimiter} */
exports.RateLimiter = require('./lib/network/rate-limiter');

/** {@link DataChannelClient} */
exports.DataChannelClient = require('./lib/data-channels/client');

/** {@link DataChannelServer} */
exports.DataChannelServer = require('./lib/data-channels/server');

/** {@link DataChannelPointer} */
exports.DataChannelPointer = require('./lib/data-channels/pointer');

/** {@link module:storj/datachannel/errors} */
exports.DataChannelErrors = require('./lib/data-channels/error-codes');

/** {@link Protocol} */
exports.Protocol = require('./lib/network/protocol');

/** {@link TunnelServer} */
exports.TunnelServer = require('./lib/tunnel/server');

/** {@link TunnelMuxer} */
exports.TunnelMuxer = require('./lib/tunnel/multiplexer');

/** {@link TunnelDemuxer} */
exports.TunnelDemuxer = require('./lib/tunnel/demultiplexer');

/** {@link module:storj/tunnel/errors} */
exports.TunnelErrors = require('./lib/tunnel/error-codes');

/** {@link TunnelClient} */
exports.TunnelClient = require('./lib/tunnel/client');

/** {@link EncryptStream} */
exports.EncryptStream = require('./lib/crypto-tools/encrypt-stream');

/** {@link DecryptStream} */
exports.DecryptStream = require('./lib/crypto-tools/decrypt-stream');

/** {@link FileMuxer} */
exports.FileMuxer = require('./lib/file-handling/file-muxer');

/** {@link FileDemuxer} */
exports.FileDemuxer = require('./lib/file-handling/file-demuxer');

/** {@link Padder} */
exports.Padder = require('./lib/file-handling/padder');

/** {@link Unpadder} */
exports.Unpadder = require('./lib/file-handling/unpadder');

/** {@link Contract} */
exports.Contract = require('./lib/contract');

/** {@link OfferStream} */
exports.OfferStream = require('./lib/contract/offer-stream');

/** {@link OfferManager} */
exports.OfferManager = require('./lib/contract/offer-manager');

/** {@link AuditStream} */
exports.AuditStream = require('./lib/audit-tools/audit-stream');

/** {@link ProofStream} */
exports.ProofStream = require('./lib/audit-tools/proof-stream');

/** {@link Verification} */
exports.Verification = require('./lib/audit-tools/verification');

/** {@link StorageManager} */
exports.StorageManager = require('./lib/storage/manager');

/** {@link StorageAdapter} */
exports.StorageAdapter = require('./lib/storage/adapter');

/** {@link StorageMigration} */
exports.StorageMigration = require('./lib/storage/migration');

/** {@link EmbeddedStorageAdapter} */
exports.EmbeddedStorageAdapter = require('./lib/storage/adapters/embedded');

/** {@link RAMStorageAdapter} */
exports.RAMStorageAdapter = require('./lib/storage/adapters/ram');

/** {@link StorageItem} */
exports.StorageItem = require('./lib/storage/item');

/** {@link DataCipherKeyIv} */
exports.DataCipherKeyIv = require('./lib/crypto-tools/cipher-key-iv');

/** {@link DataCipherKeyIv} */
exports.DeterministicKeyIv = require('./lib/crypto-tools/deterministic-key-iv');

/** {@link KeyPair} */
exports.KeyPair = require('./lib/crypto-tools/keypair');

/** {@link KeyRing} */
exports.KeyRing = require('./lib/crypto-tools/keyring');

/** {@link RenterInterface} */
exports.RenterInterface = require('./lib/network/interfaces/renter');

/** {@link FarmerInterface} */
exports.FarmerInterface = require('./lib/network/interfaces/farmer');

/** {@link TunnelerInterface} */
exports.TunnelerInterface = require('./lib/network/interfaces/tunneler');

/** {@link BridgeClient} */
exports.BridgeClient = require('./lib/bridge-client');

/** {@link module:storj/version} */
exports.version = require('./lib/version');

/** {@link module:storj/constants} */
exports.constants = require('./lib/constants');

/** {@link module:storj/utils} */
exports.utils = require('./lib/utils');

/** {@link module:storj/deps} */
exports.deps = require('./lib/deps');

/** {@link module:storj/sips} */
exports.sips = require('./lib/sips');
