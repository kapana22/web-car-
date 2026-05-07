const { handleLeadsRequest } = require('../../lib/handlers');

exports.handler = async event => {
  return handleLeadsRequest({
    method: event.httpMethod,
    headers: event.headers
  });
};
