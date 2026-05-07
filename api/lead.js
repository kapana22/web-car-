const { handleLeadRequest, readNodeRequestBody, sendNodeResponse } = require('../lib/handlers');

module.exports = async (req, res) => {
  const body = await readNodeRequestBody(req);
  const response = await handleLeadRequest({
    method: req.method,
    headers: req.headers,
    body,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
  });

  sendNodeResponse(res, response);
};
