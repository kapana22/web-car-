const { handleAdminRequest, sendNodeResponse } = require('../lib/handlers');

module.exports = async (req, res) => {
  const response = await handleAdminRequest({
    method: req.method,
    headers: req.headers
  });

  sendNodeResponse(res, response);
};
