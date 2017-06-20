'use strict';

const { createRequest, createResponse } = require('node-mocks-http');


module.exports = function createMocks(requestOptions) {
  const req = createRequest(requestOptions);
  const res = createResponse({
    req,
    writableStream: require('stream').Writable,
    eventEmitter: require('events').EventEmitter
  });

  return [req, res];
};
