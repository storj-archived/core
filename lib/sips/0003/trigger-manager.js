'use strict';

var assert = require('assert');

/**
 * Implements behavior triggers as described in SIP-0003
 * @constructor
 * @license AGPL-3.0
 * @see https://github.com/storj/sips/blob/master/sip-0003.md
 */
function TriggerManager(options) {
  if (!(this instanceof TriggerManager)) {
    return new TriggerManager(options);
  }

  this._options = options;
  this._authorized = {};
  this._behaviors = {};
}

/**
 * Adds a trigger handler for the given nodeID and behavior
 * @param {String|Array} nodeID - The nodeID(s) to authorize for the trigger
 * (supports `*` wildcard)
 * @param {Object} behaviors - Behavior name to {TriggerManager~triggerHandler}s
 */
TriggerManager.prototype.add = function(nodeID, behaviors) {
  var self = this;

  if (Array.isArray(nodeID)) {
    return nodeID.forEach(function(nodeID) {
      self.add(nodeID, behaviors);
    });
  }

  for (var behavior in behaviors) {
    assert(
      typeof behaviors[behavior] === 'function',
      'Trigger handler must be a function'
    );

    if (!this._authorized[behavior]) {
      this._authorized[behavior] = [];
    }

    if (this._authorized[behavior].indexOf(nodeID) === -1) {
      this._authorized[behavior].push(nodeID);
    }

    this._behaviors[nodeID + ':' + behavior] = behaviors[behavior];
  }
};

/**
 * Removes a trigger handler for the given nodeID and behavior
 * @param {String|Array} nodeID - The nodeID(s) to deauthorize for the trigger
 * @param {String|Array} behaviors - Behavior name to unregister
 */
TriggerManager.prototype.remove = function(nodeID, behavior) {
  var self = this;

  if (Array.isArray(nodeID)) {
    return nodeID.forEach(function(nodeID) {
      if (Array.isArray(behavior)) {
        return behavior.forEach(function(behavior) {
          self.remove(nodeID, behavior);
        });
      }

      self.remove(nodeID, behavior);
    });
  }

  if (this._authorized[behavior]) {
    var index = this._authorized[behavior].indexOf(nodeID);

    if (index !== -1) {
      this._authorized[behavior].splice(index, 1);
    }
  }

  delete this._behaviors[nodeID + ':' + behavior];
};

/**
 * Process a received trigger message
 * @param {Object} messageParams - The received message params
 * @param {TriggerManager~processCallback} callback - Result of trigger process
 */
TriggerManager.prototype.process = function(messageParams, callback) {
  var authorized = this._authorized[messageParams.behavior];
  var allowAnySource = authorized ? authorized.indexOf('*') !== -1 : false;
  var sourceNodeId = allowAnySource || messageParams.contact.nodeID;

  if (!authorized) {
    return callback(new Error('No trigger handler defined for behavior'));
  }

  if (!allowAnySource && authorized.indexOf(sourceNodeId) === -1) {
    return callback(new Error('Not authorized to process trigger'));
  }

  this._behaviors[sourceNodeId + ':' + messageParams.behavior](
    messageParams,
    callback,
    this.remove.bind(this, sourceNodeId, messageParams.behavior)
  );
};

/**
 * Called when a trigger is received from authorized source
 * @callback TriggerManager~triggerHandler
 * @param {Object} messageParams - The RPC message parameters
 * @param {TriggerManager~replyToSender} replyToSender - Respond to the trigger
 * @param {TriggerManager~destroyTrigger} destroyTrigger - Unregisters trigger
 */

/**
 * Passed to the trigger handler for replying to the message
 * @callback TriggerManager~replyToSender
 * @param {Error|null} err - Optional error to respond with
 * @param {Object} params - Response parameters to return
 */

/**
 * Optionally called from trigger handler to unregister the trigger handler
 * @callback TriggerManager~destroyTrigger
 */

/**
 * Called upon the processing of a trigger message
 * @callback TriggerManager~processCallback
 * @param {Error|null} err - Optional error resulting from processing
 * @param {Object} params - Response parameters to send back
 */

module.exports = TriggerManager;
