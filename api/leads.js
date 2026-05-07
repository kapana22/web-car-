const { handleLeadsRequest, sendNodeResponse } = require('../lib/handlers');

module.exports = async (req, res) => {
  const response = await handleLeadsRequest({
    method: req.method,
    headers: req.headers
  });

  sendNodeResponse(res, response);
};
