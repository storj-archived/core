Install *globally* with NPM:

```
[sudo] npm install -g storj
```

Once installed, you will have access to the `storj` command line interface. To
make sure everything installed correctly, run:

```
storj --help
```

The first time you run the `storj` CLI, it will walk you through a setup wizard
to generate a configuration file and an ECDSA private key which will be
encrypted with a passphrase of your choice.

```
> $ storj

 Let's setup your Storj configuration!

 :STORJ: >> Enter your public hostname or IP address >>  (127.0.0.1)
 :STORJ: >> Enter the port number the service should use >>  (4000)
 :STORJ: >> Enter the level of verbosity for the logs (0-4) >>  (3)
 :STORJ: >> Accept storage contracts from the network? (true/false) >>  (false)
 :STORJ: >> Enter the URI of a known seed >>  (storj://api.metadisk.org:8443/593844dc7f0076a1aeda9a6b9788af17e67c1052)
 :STORJ: >> Enter the path to store configuration and data >>  (/home/gordon/.storjnode)
 :STORJ: >> Enter the path to store your encrypted private key >>  (/home/gordon/.storjnode/id_ecdsa)
 :STORJ: >> Enter a password to protect your private key >>  ********
```

Once the setup wizard has completed, you will be asked to decrypt your key and
the program will connect to the network.

```bash
:STORJ: >> Unlock your private key to start storj >>  ********

:STORJ: {info} node created with nodeID db3f125d82885c5e3b78790bd4ed46b3f214ec44
:STORJ: {info} sending FIND_NODE message to {"address":"dev.metadisk.org","port":7500,"nodeID":"9f7e84fa954ef691c1de73002ad1cfcd12b13a26","lastSeen":1456424333461}
:STORJ: {info} received valid message from {"address":"162.243.118.98","port":7500,"nodeID":"9f7e84fa954ef691c1de73002ad1cfcd12b13a26","lastSeen":1456424333732}
:STORJ: {info} sending FIND_NODE message to {"address":"127.0.0.1","port":4000,"nodeID":"c2ca92d532f2ddba789a83b12496b685df9912c4","lastSeen":1456424333801}
:STORJ: {info} sending FIND_NODE message to {"address":"162.243.117.41","port":4000,"nodeID":"f67c29e5d555c8934b75292a136f545938bd3424","lastSeen":1456424333823}
:STORJ: {info} sending FIND_NODE message to {"address":"127.0.0.1","port":4000,"nodeID":"03132edc1d1ad700f89282456020d84af5007feb","lastSeen":1456424333860}
:STORJ: {info} received valid message from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424333894}
:STORJ: {info} received FIND_NODE from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424333424}
:STORJ: {info} replying to message to 617833726d3a676a7cd91bd9fb558d859e883272
:STORJ: {info} received valid message from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424333947}
:STORJ: {info} received FIND_NODE from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424333424}
:STORJ: {info} replying to message to 36a3e4746172c4ee239998e65248a5017c430814
:STORJ: {info} received valid message from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424333989}
:STORJ: {info} received valid message from {"address":"127.0.0.1","port":4000,"nodeID":"db3f125d82885c5e3b78790bd4ed46b3f214ec44","lastSeen":1456424334014}
:STORJ: {info} received valid message from {"address":"162.243.117.41","port":4000,"nodeID":"f67c29e5d555c8934b75292a136f545938bd3424","lastSeen":1456424334157}
:STORJ: {info} sending FIND_NODE message to {"address":"162.243.110.37","port":4000,"nodeID":"3c425f6b359d86fdd15e8e7ea10194e905f5256b","lastSeen":1456424334209}
:STORJ: {info} sending FIND_NODE message to {"address":"162.243.48.250","port":4000,"nodeID":"6addea0e9fda1373955a2e9deace3182145de60e","lastSeen":1456424334226}
:STORJ: {info} received valid message from {"address":"162.243.110.37","port":4000,"nodeID":"3c425f6b359d86fdd15e8e7ea10194e905f5256b","lastSeen":1456424334348}
:STORJ: {info} received valid message from {"address":"162.243.48.250","port":4000,"nodeID":"6addea0e9fda1373955a2e9deace3182145de60e","lastSeen":1456424334386}
:STORJ: {info} sending FIND_NODE message to {"address":"162.243.117.41","port":4000,"nodeID":"f67c29e5d555c8934b75292a136f545938bd3424","lastSeen":1456424334413}
:STORJ: {info} sending FIND_NODE message to {"address":"dev.metadisk.org","port":7500,"nodeID":"9f7e84fa954ef691c1de73002ad1cfcd12b13a26","lastSeen":1456424334436}
:STORJ: {info} sending FIND_NODE message to {"address":"162.243.48.250","port":4000,"nodeID":"6addea0e9fda1373955a2e9deace3182145de60e","lastSeen":1456424334455}
:STORJ: {info} received valid message from {"address":"162.243.48.250","port":4000,"nodeID":"6addea0e9fda1373955a2e9deace3182145de60e","lastSeen":1456424334611}
:STORJ: {info} received valid message from {"address":"162.243.117.41","port":4000,"nodeID":"f67c29e5d555c8934b75292a136f545938bd3424","lastSeen":1456424334659}
```

You can run multiple instances by specifying a different data directory using
the `--datadir` option. If no configuration has been created for the given
data directory, then the setup wizard will run again.

### Running in the Background

You can run a farmer in the background using a process manager like
[PM2](https://github.com/Unitech/pm2):

```
npm install -g pm2
```

Now you can instruct PM2 to start your farmer in the background and keep it
running, restarting it automatically in the event that it goes down.

```
pm2 start path/to/node-storj/bin/storj.js -- --password <your_password>
```

Check the logs at any time with:

```
pm2 logs 0
```

### Configuring Contract Subscriptions

By default, if you indicated during the wizard that you'd like to accept
storage contracts from the network, `storj` will set a few common contract
opcode sequences in your configuration file:

```
{
  ...
  "farmer": [
    "01020202",
    "02020202",
    "03020202"
  ],
  ...
}
```

These opcodes indicate you are interested in storing shards between 0mb-32mb
for up to 90 days at a time and that your availability and speed is average. You
might like to tweak these settings to better suit your hardware. See
{@tutorial contract-topics} for more information on which opcodes you should
use.
