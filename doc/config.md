---

Node Configuration & Setup
==========================

This guide will show you how to get started with running `storjd`! A Storj 
node requires a configuration file to get up and running. The path to this 
file is given to `storjd` when starting a node.

```
storjd --config path/to/storjd.conf
```

If a configuration file is not supplied, a minimal default configuration is 
automatically created and used, which will generate a private extended key, 
self-signed SSL certificate, and storage for shards, contracts, and directory 
information. All of this data will be created and stored in 
`$HOME/.config/storjd`, yielding a directory structure like this:

```
+- ~/.config/storjd
  + - x_private_key
  + - config
  + - service_key.pem
  + - certificate.pem
  + - /contracts.db
    + - ...
  + - /shards.kfs
    + - ...
  + - /directory.db
    + - ...
```

The locations of all of these files is defined in your configuration file. 
Below is a complete sample config in INI format (though JSON is also 
supported). Comments are inline to describe each property.

Default Configuration
---------------------

```ini
;
; Storj Core Sample Configuration
;

; Path to private extended key file to use for master identity.
; Generate one with:
; 
;   storjutil generate-key --extended >> x_private_key
;
; If you are migrating from an older version of Storj Core before support for 
; hierarchically deterministic keys was added, you can convert your old key
; to the new format with:
;
;   storjutil generate-key --convert [hex_private_key] >> x_private_key
;
PrivateExtendedKeyPath = /home/bookchin/.config/storjd/x_private_key

; The index for deriving this child node's identity. This allows you to run 
; multiple nodes with the same private extended key. If your private extended 
; key was converted from an old non-hierarchically-deterministic private key,
; you must set the value to -1
ChildDerivationIndex = 0

; Set the base directory (parent) for where the contracts.db folder will be 
; placed. The contracts.db holds storage contracts between you and other nodes.
ContractStorageBaseDir = /home/bookchin/.config/storjd

; Set the base directory (parent) for where the shards.kfs folder will be 
; placed. The shards.kfs stores other nodes data shards, so be sure you set 
; this to where you intend to store farmed shards.
ShardStorageBaseDir = /home/bookchin/.config/storjd

; Define the maximum size you wish to allocate for farming shards. This can be 
; increased later, but decreasing it will not delete existing data.
ShardStorageMaxAllocation = 0GB

; Maximum number of open file descriptors per shard bucket in shards.kfs. It's 
; best to leave it at the default here (or not define it at all) unless you 
; know what you are doing.
ShardStorageMaxOpenFiles = 50

; Enables renter nodes to directly claim storage capacity based on any capacity 
; announcements you have made. If you are farming, set this value once for every 
; trusted renter public extended key from which you will accept claims or once 
; with a value of *
AllowDirectStorageClaims[] = none

; Set the base directory (parent) for where the directory.db folder will be 
; placed. The directory.db holds key-value pairs for the distributed hash 
; table, which serve various purposes such as reputation data on other peers.
DirectoryStorageBaseDir = /home/bookchin/.config/storjd

; Paths to this node's SSL key and certificat. If you don't have one, you can 
; generate one with the following:
;
;   storjutil generate-cert | csplit - 28
;   mv xx00 service_key.pem
;   mv xx01 certificate.pem
;
TransportServiceKeyPath = /home/bookchin/.config/storjd/service_key.pem
TransportCertificatePath = /home/bookchin/.config/storjd/certificate.pem

; Set the public hostname or IP address at which your node will reachable to 
; others. If NatTraversalEnabled = 1, you may leave this as 127.0.0.1, but it
; it reccommended to configure port forwarding on your router and use a 
; dynamic DNS service or set your static IP address.
PublicHostname = 127.0.0.1

; Set the public port number at which your node will be reachable to others. 
; This should be the port you forwarded.
PublicPort = 4000

; If set to 1, we will try to use UPnP and/or NAT-PMP to configure port 
; forwarding for you. It is safe to leave set this to 1 even if you are 
; already forwarded, since it will check if you are public before proceeding. 
; If you have a dynamic IP address, it's good to enable this as we will also 
; periodically check you public IP and update your PublicHostname.
NatTraversalEnabled = 0

; Set the local port to bind the node service.
ListenPort = 4000

; Enables bandwidth metering and hibernation mode. When the property 
; BandwidthAccountingEnabled is 1, we will enter low-bandwidth mode if the we
; exceed BandwidthAccountingMax within the period defined by the property 
; BandwidthAccountingReset until the interval is finished
BandwidthAccountingEnabled = 0
BandwidthAccountingMax = 5GB
BandwidthAccountingReset = 24HR

; Set to 1 for more detailed logging, which is useful for debugging
VerboseLoggingEnabled = 1

; Set the ControlPort to bind the control interface. Used for controlling the 
; node from other applications. Be sure that ControlHostname is kept set to 
; a loopback address, unless you have taken other measures to prevent others 
; from controlling your node.
ControlPort = 4001
ControlHostname = 127.0.0.1

; Add a map of network bootstrap nodes to this section to use for discovering 
; other peers. Default configuration should come with a list of known and 
; trusted contacts. Formatted as "{node-id} = https://{hostname}:{port}".
[NetworkBootstrapNodes]
78652c1229ba21a48c28e8ef73fa06f174b4a596 = https://seed.bookch.in:8443
```
