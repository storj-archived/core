'use strict';
var log = require('./../logger')().log;
var utils = require('./../utils');

module.exports.add = function() {
  var client = this._storj.PrivateClient();

  client.createFileStagingFrame(function(err, frame) {
    if (err) {
      return log('error', err.message);
    }

    log('info', 'ID: %s, Created: %s', [frame.id, frame.created]);
  });
};

module.exports.list = function() {
  var client = this._storj.PrivateClient();

  client.getFileStagingFrames(function(err, frames) {
    if (err) {
      return log('error', err.message);
    }

    if (!frames.length) {
      return log('warn', 'There are no frames to list.');
    }

    frames.forEach(function(frame) {
      log(
        'info',
        'ID: %s, Created: %s, Shards: %s',
        [frame.id, frame.created, frame.shards.length]
      );
    });
  });
};

module.exports.get = function(frame) {
  var client = this._storj.PrivateClient();

  client.getFileStagingFrameById(frame, function(err, frame) {
    if (err) {
      return log('error', err.message);
    }

    log(
      'info',
      'ID: %s, Created: %s, Shards: %s',
      [frame.id, frame.created, frame.shards.length]
    );
  });
};

module.exports.remove = function(frame, env) {
  var client = this._storj.PrivateClient();

  function destroyFrame() {
    client.destroyFileStagingFrameById(frame, function(err) {
      if (err) {
        return log('error', err.message);
      }

      log('info', 'Frame was successfully removed.');
    });
  }

  if (!env.force) {
    return utils.getConfirmation(
      'Are your sure you want to destroy this frame?',
      destroyFrame
    );
  }

  destroyFrame();
};
