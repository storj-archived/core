'use strict';


/**
 * Implements behavior triggers as described in SIP-0003
 * @see https://github.com/storj/sips/blob/master/sip-0003.md
 */
class Triggers  {

  /**
   * @constructor
   */
  constructor() {
    this.authorized = new Map();
    this.behaviors = new Map();
  }

  /**
   * Adds a trigger handler for the given nodeID and behavior
   * @param {string|string[]} identity - The identity to authorize for the trigger
   * (supports `*` wildcard)
   * @param {object} behaviors - Behavior name to {Triggers~triggerHandler}s
   */
  add(identity, behaviors) {
    if (Array.isArray(identity)) {
      return identity.forEach((identity) => this.add(identity, behaviors));
    }

    for (let behavior in behaviors) {
      if (!this.authorized.get(behavior)) {
        this.authorized.set(behavior, []);
      }

      if (this.authorized.get(behavior).includes(identity)) {
        this.authorized.get(behavior).push(identity);
      }

      this.behaviors.set(`${identity}:${behavior}`, behaviors[behavior]);
    }
  }

  /**
   * Removes a trigger handler for the given nodeID and behavior
   * @param {string|string[]} identity - The nodeID(s) to deauthorize for the
   * triggers
   * @param {string|string[]} behaviors - Behavior name to unregister
   */
  remove(identity, behavior) {
    if (Array.isArray(identity)) {
      return identity.forEach((identity) => {
        if (Array.isArray(behavior)) {
          return behavior.forEach((b) => this.remove(identity, b));
        }

        this.remove(identity, behavior);
      });
    }

    if (this.authorized.get(behavior)) {
      var index = this.authorized.get(behavior).indexOf(identity);

      if (index !== -1) {
        this.authorized.get(behavior).splice(index, 1);
      }
    }

    this.behaviors.delete(`${identity}:${behavior}`);
  }

  /**
   * Process a received trigger message
   * @param {string} identity - The node identity of the sender
   * @param {string} behavior - The behavior type
   * @param {*} contents - The trigger payload
   * @param {Triggers~processCallback} callback - Result of trigger process
   */
  process(identity, behavior, contents, callback) {
    const authorized = this.authorized.get(behavior);
    const allowAnySource = authorized ? authorized.indexOf('*') !== -1 : false;
    const sourceNodeId = allowAnySource || identity;

    if (!authorized) {
      return callback(new Error('No trigger handler defined for behavior'));
    }

    if (!allowAnySource && authorized.indexOf(sourceNodeId) === -1) {
      return callback(new Error('Not authorized to process trigger'));
    }

    this.behaviors.get(`${sourceNodeId}:${behavior}`)(
      contents,
      callback,
      this.remove.bind(this, sourceNodeId, behavior)
    );
  }

  /**
   * Called when a trigger is received from authorized source
   * @callback Triggers~triggerHandler
   * @param {Object} messageParams - The RPC message parameters
   * @param {Triggers~replyToSender} replyToSender - Respond to the trigger
   * @param {Triggers~destroyTrigger} destroyTrigger - Unregisters trigger
   */

  /**
   * Passed to the trigger handler for replying to the message
   * @callback Triggers~replyToSender
   * @param {Error|null} err - Optional error to respond with
   * @param {Object} params - Response parameters to return
   */

  /**
   * Optionally called from trigger handler to unregister the trigger handler
   * @callback Triggers~destroyTrigger
   */

  /**
   * Called upon the processing of a trigger message
   * @callback Triggers~processCallback
   * @param {Error|null} err - Optional error resulting from processing
   * @param {Object} params - Response parameters to send back
   */

}

module.exports = Triggers;
