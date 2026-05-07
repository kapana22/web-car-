const {
  checkRateLimit,
  clean,
  isAuthorized,
  isPhone,
  renderAdminPage,
  store
} = require('./core');

function jsonResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function textResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders
    },
    body
  };
}

function htmlResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders
    },
    body
  };
}

function unauthorizedResponse() {
  return textResponse(401, 'Auth required', { 'WWW-Authenticate': 'Basic realm="admin"' });
}

async function readNodeRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parseBodyByType(req.body, req.headers['content-type'] || '');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return parseBodyByType(raw, req.headers['content-type'] || '');
}

function parseBodyByType(rawBody, contentType) {
  if (!rawBody) return {};

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return {};
}

async function handleLeadRequest({ method, headers, body, ip }) {
  if (method !== 'POST') {
    return textResponse(405, 'Method Not Allowed', { Allow: 'POST' });
  }

  if (!checkRateLimit(ip)) {
    return jsonResponse(429, { ok: false, error: 'Too many submissions. Please try again in a minute.' });
  }

  const name = clean(body?.name, 80);
  const phone = clean(body?.phone, 30);
  const vehicle = clean(body?.vehicle, 120);
  const service = clean(body?.service, 120);
  const notes = clean(body?.notes, 500);

  if (!name) return jsonResponse(400, { ok: false, error: 'Name is required.' });
  if (!isPhone(phone)) return jsonResponse(400, { ok: false, error: 'A valid phone number is required.' });

  const id = store.insertLead({
    name,
    phone,
    vehicle,
    service,
    notes,
    user_agent: clean(headers['user-agent'] || '', 300),
    ip: clean(ip || '', 64)
  });

  return jsonResponse(200, { ok: true, id, storage: store.mode });
}

async function handleLeadsRequest({ method, headers }) {
  if (method !== 'GET') {
    return textResponse(405, 'Method Not Allowed', { Allow: 'GET' });
  }

  if (!isAuthorized(headers.authorization || headers.Authorization)) {
    return unauthorizedResponse();
  }

  const leads = store.getLeads();
  return jsonResponse(200, { ok: true, count: leads.length, leads, storage: store.mode });
}

async function handleAdminRequest({ method, headers }) {
  if (method !== 'GET') {
    return textResponse(405, 'Method Not Allowed', { Allow: 'GET' });
  }

  if (!isAuthorized(headers.authorization || headers.Authorization)) {
    return unauthorizedResponse();
  }

  return htmlResponse(200, renderAdminPage(store.getLeads()));
}

function sendNodeResponse(res, response) {
  res.statusCode = response.status;
  for (const [key, value] of Object.entries(response.headers || {})) {
    res.setHeader(key, value);
  }
  res.end(response.body);
}

module.exports = {
  handleAdminRequest,
  handleLeadRequest,
  handleLeadsRequest,
  parseBodyByType,
  readNodeRequestBody,
  sendNodeResponse
};
