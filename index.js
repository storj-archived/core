/**
 * @module storj
 * @license (AGPL-3.0 AND LGPL-3.0)
 */

'use strict';

require('./lib/patches')(); // NB: Apply any monkey patches

/** {@link Network} */
exports.Network = require('./lib/network');

/** {@link Protocol} */
exports.Protocol = require('./lib/network/protocol');

/** {@link Renter} */
exports.Renter = require('./lib/network/renter');

/** {@link Farmer} */
exports.Farmer = require('./lib/network/farmer');

/** {@link Monitor} */
exports.Monitor = require('./lib/network/monitor');

/** {@link Transport} */
exports.Transport = require('./lib/network/transport');

/** {@link ShardServer} */
exports.ShardServer = require('./lib/network/shard-server');

/** {@link Contact} */
exports.Contact = require('./lib/network/contact');

/** {@link EncryptStream} */
exports.EncryptStream = require('./lib/crypto-tools/encrypt-stream');

/** {@link DecryptStream} */
exports.DecryptStream = require('./lib/crypto-tools/decrypt-stream');

/** {@link FileMuxer} */
exports.FileMuxer = require('./lib/file-handling/file-muxer');

/** {@link FileDemuxer} */
exports.FileDemuxer = require('./lib/file-handling/file-demuxer');

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

/** {@link DeterministicKeyIv} */
exports.DeterministicKeyIv = require('./lib/crypto-tools/deterministic-key-iv');

/** {@link KeyPair} */
exports.KeyPair = require('./lib/crypto-tools/keypair');

/** {@link KeyRing} */
exports.KeyRing = require('./lib/crypto-tools/keyring');

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
