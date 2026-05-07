require('dotenv').config();
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me-please';
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isPhone(value) {
  return typeof value === 'string' && /[\d().+\-\s]{7,}/.test(value) && value.replace(/\D/g, '').length >= 7;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function createJsonStore(filePath, mode) {
  function readLeads() {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return [];
    }
  }

  function writeLeads(leads) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
  }

  return {
    mode,
    insertLead(lead) {
      const leads = readLeads();
      const id = randomUUID();
      leads.unshift({ id, ...lead, created_at: new Date().toISOString() });
      writeLeads(leads.slice(0, 500));
      return id;
    },
    getLeads() {
      return readLeads().slice(0, 500);
    }
  };
}

function createStore() {
  const preferred = process.env.LEADS_STORAGE || '';
  const localDataDir = path.join(__dirname, '..', 'data');

  if (preferred === 'memory') {
    const leads = [];
    return {
      mode: 'memory',
      insertLead(lead) {
        const id = randomUUID();
        leads.unshift({ id, ...lead, created_at: new Date().toISOString() });
        leads.splice(500);
        return id;
      },
      getLeads() {
        return leads.slice(0, 500);
      }
    };
  }

  if (isServerless) {
    return createJsonStore(path.join('/tmp', 'autoflex-leads.json'), 'json-tmp');
  }

  if (preferred !== 'json') {
    try {
      fs.mkdirSync(localDataDir, { recursive: true });
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(localDataDir, 'leads.db'));

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
        mode: 'sqlite',
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
        }
      };
    } catch (error) {
      console.warn(`SQLite unavailable, falling back to JSON storage: ${error.message}`);
    }
  }

  return createJsonStore(path.join(localDataDir, 'leads.json'), 'json');
}

const store = createStore();
const rateBucket = new Map();

function checkRateLimit(ip) {
  const key = clean(ip, 64) || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 5;
  const hits = (rateBucket.get(key) || []).filter(timestamp => now - timestamp < windowMs);

  if (hits.length >= max) {
    rateBucket.set(key, hits);
    return false;
  }

  hits.push(now);
  rateBucket.set(key, hits);
  return true;
}

function isAuthorized(header) {
  if (!header || typeof header !== 'string') return false;
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

function renderAdminPage(rows) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Leads — Autoflex</title>
<style>
body{font-family:system-ui,sans-serif;background:#0c0d0f;color:#f1efe9;margin:0;padding:24px}
h1{font-weight:600;margin:0 0 16px}
.count{color:#8a8e96;margin-bottom:8px}
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
<div class="mode">Storage mode: ${escapeHtml(store.mode)}</div>
${rows.length === 0 ? '<div class="empty">No leads yet.</div>' : `<table>
<thead><tr><th>#</th><th>When</th><th>Name</th><th>Phone</th><th>Vehicle</th><th>Service</th><th>Notes</th></tr></thead>
<tbody>${rows.map(row => `<tr>
<td>${escapeHtml(row.id)}</td>
<td>${escapeHtml(row.created_at || '')}</td>
<td>${escapeHtml(row.name)}</td>
<td><a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></td>
<td>${escapeHtml(row.vehicle || '')}</td>
<td>${escapeHtml(row.service || '')}</td>
<td>${escapeHtml(row.notes || '')}</td>
</tr>`).join('')}</tbody></table>`}
</body></html>`;
}

module.exports = {
  ADMIN_PASS,
  ADMIN_USER,
  checkRateLimit,
  clean,
  escapeHtml,
  isAuthorized,
  isPhone,
  renderAdminPage,
  store
};
