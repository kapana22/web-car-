require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me-please';
const dataDir = path.join(__dirname, 'data');

function createStore() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(dataDir, 'leads.db'));

    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        phone       TEXT NOT NULL,
        vehicle     TEXT,
        service     TEXT,
        notes       TEXT,
        user_agent  TEXT,
        ip          TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    return {
      insertLead(lead) {
        const stmt = db.prepare(`
          INSERT INTO leads (name, phone, vehicle, service, notes, user_agent, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          lead.name,
          lead.phone,
          lead.vehicle,
          lead.service,
          lead.notes,
          lead.user_agent,
          lead.ip
        );
        return Number(info.lastInsertRowid);
      },
      getLeads() {
        return db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 500').all();
      },
      mode: 'sqlite'
    };
  } catch (error) {
    const fallbackDir = process.env.VERCEL ? '/tmp' : dataDir;
    const fallbackFile = path.join(fallbackDir, 'leads.json');

    function readLeads() {
      try {
        return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
      } catch {
        return [];
      }
    }

    function writeLeads(leads) {
      fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
      fs.writeFileSync(fallbackFile, JSON.stringify(leads, null, 2));
    }

    console.warn(`SQLite unavailable, using JSON fallback storage: ${error.message}`);

    return {
      insertLead(lead) {
        const leads = readLeads();
        const id = (leads[0]?.id || 0) + 1;
        leads.unshift({
          id,
          ...lead,
          created_at: new Date().toISOString()
        });
        writeLeads(leads.slice(0, 500));
        return id;
      },
      getLeads() {
        return readLeads().slice(0, 500);
      },
      mode: 'json'
    };
  }
}

const store = createStore();
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const leadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many submissions. Please try again in a minute.' }
});

const isPhone = v => typeof v === 'string' && /[\d().+\-\s]{7,}/.test(v) && v.replace(/\D/g, '').length >= 7;
const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

app.post('/api/lead', leadLimiter, (req, res) => {
  const name = clean(req.body.name, 80);
  const phone = clean(req.body.phone, 30);
  const vehicle = clean(req.body.vehicle, 120);
  const service = clean(req.body.service, 120);
  const notes = clean(req.body.notes, 500);

  if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' });
  if (!isPhone(phone)) return res.status(400).json({ ok: false, error: 'A valid phone number is required.' });

  const id = store.insertLead({
    name,
    phone,
    vehicle,
    service,
    notes,
    user_agent: clean(req.get('user-agent') || '', 300),
    ip: clean(req.ip || '', 64)
  });

  res.json({ ok: true, id, storage: store.mode });
});

function basicAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Auth required');
  }
  const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Bad credentials');
  }
  next();
}

app.get('/api/leads', basicAuth, (req, res) => {
  const rows = store.getLeads();
  res.json({ ok: true, count: rows.length, leads: rows, storage: store.mode });
});

app.get('/admin', basicAuth, (req, res) => {
  const rows = store.getLeads();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Leads — Autoflex</title>
<style>
body{font-family:system-ui,sans-serif;background:#0c0d0f;color:#f1efe9;margin:0;padding:24px}
h1{font-weight:600;margin:0 0 16px}
.count{color:#8a8e96;margin-bottom:20px}
.mode{color:#8a8e96;margin-bottom:20px;font-size:13px}
table{width:100%;border-collapse:collapse;background:#15171a;border:1px solid rgba(255,255,255,.08);border-radius:4px;overflow:hidden}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;vertical-align:top}
th{background:#1d2025;font-weight:600;color:#e9a04b;font-size:11px;letter-spacing:1px;text-transform:uppercase}
tr:hover{background:rgba(255,255,255,.02)}
a{color:#e9a04b}
.empty{text-align:center;color:#8a8e96;padding:40px}
</style></head><body>
<h1>Leads — Autoflex Collision Center</h1>
<div class="count">${rows.length} total submission${rows.length === 1 ? '' : 's'}</div>
<div class="mode">Storage mode: ${store.mode}</div>
${rows.length === 0 ? '<div class="empty">No leads yet.</div>' : `<table>
<thead><tr><th>#</th><th>When</th><th>Name</th><th>Phone</th><th>Vehicle</th><th>Service</th><th>Notes</th></tr></thead>
<tbody>${rows.map(r => `<tr>
<td>${r.id}</td>
<td>${escapeHtml(r.created_at)}</td>
<td>${escapeHtml(r.name)}</td>
<td><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a></td>
<td>${escapeHtml(r.vehicle || '')}</td>
<td>${escapeHtml(r.service || '')}</td>
<td>${escapeHtml(r.notes || '')}</td>
</tr>`).join('')}</tbody></table>`}
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|svg|woff2)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=2592000');
    }
  }
}));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = { app, store };
