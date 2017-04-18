'use strict';



/**
 * Represents Storj protocol handlers
 */
class StorjRules {

  /**
   * Constructs a Storj rules instance in the context of a Storj node
   * @constructor
   * @param {StorjNode} node
   */
  constructor(node) {
    this.node = node;
  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  offer(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  audit(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  consign(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  mirror(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  retrieve(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  probe(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  trigger(request, response, next) {

  }

  /**
   *
   * @param {object} request
   * @param {object} response
   */
  renew(request, response, next) {

  }

}

module.exports = StorjRules;
