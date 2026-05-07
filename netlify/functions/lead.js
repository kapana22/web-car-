const { handleLeadRequest, parseBodyByType } = require('../../lib/handlers');

exports.handler = async event => {
  const body = parseBodyByType(event.body || '', event.headers['content-type'] || event.headers['Content-Type'] || '');

  const response = await handleLeadRequest({
    method: event.httpMethod,
    headers: event.headers,
    body,
    ip: event.headers['x-forwarded-for']?.split(',')[0]?.trim() || event.headers['client-ip'] || ''
  });

  return response;
};
