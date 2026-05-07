const { handleAdminRequest } = require('../../lib/handlers');

exports.handler = async event => {
  return handleAdminRequest({
    method: event.httpMethod,
    headers: event.headers
  });
};
