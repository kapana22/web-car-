const express = require('express');
const path = require('path');
const {
  handleAdminRequest,
  handleLeadRequest,
  handleLeadsRequest,
  sendNodeResponse
} = require('./lib/handlers');

const PORT = process.env.PORT || 3000;
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

app.post('/api/lead', async (req, res) => {
  const response = await handleLeadRequest({
    method: req.method,
    headers: req.headers,
    body: req.body,
    ip: req.ip
  });

  sendNodeResponse(res, response);
});

app.get('/api/leads', async (req, res) => {
  const response = await handleLeadsRequest({
    method: req.method,
    headers: req.headers
  });

  sendNodeResponse(res, response);
});

app.get('/admin', async (req, res) => {
  const response = await handleAdminRequest({
    method: req.method,
    headers: req.headers
  });

  sendNodeResponse(res, response);
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|svg|woff2)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=2592000');
    }
  }
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Autoflex landing running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
