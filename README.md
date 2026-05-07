# Autoflex Collision Center — Google Ads Landing

Single-page landing site for Autoflex Collision Center (Glendale, CA), with:

- a static landing page in `public/`
- a local Express server for development / traditional Node hosting
- serverless endpoints for Vercel and Netlify
- local SQLite storage for classic Node hosting, with JSON fallback for serverless hosts

```text
web/
├── api/                   ← Vercel serverless endpoints
├── lib/                   ← shared lead/admin logic
├── netlify/functions/     ← Netlify serverless endpoints
├── server.js              ← local Express server
├── package.json
├── vercel.json
├── netlify.toml
├── .env.example           ← copy to .env and edit
├── data/                  ← local SQLite / JSON storage
└── public/
    ├── index.html         ← the landing page
    └── images/gallery/    ← real shop photos
```

---

## 1. Install Node.js

The project needs Node.js 18 or newer. Download the LTS installer from
https://nodejs.org/ and run it (defaults are fine — make sure "Add to PATH"
is checked).

After install, open a new PowerShell window and verify:

```powershell
node --version
npm --version
```

## 2. Install dependencies

From this folder (`c:\Users\Infinity\Desktop\web`):

```powershell
npm install
```

## 3. Configure

```powershell
Copy-Item .env.example .env
notepad .env
```

Set a real `ADMIN_PASS` (used for the `/admin` page where leads are listed).

## 4. Run

```powershell
npm start
```

Then open:

- **Landing page** → http://localhost:3000
- **Admin (leads)** → http://localhost:3000/admin (basic-auth with `ADMIN_USER`/`ADMIN_PASS`)
- **Leads JSON**   → http://localhost:3000/api/leads

For development with auto-restart on file change:

```powershell
npm run dev
```

---

## Adding real photos

The gallery currently shows 6 SVG placeholders located in
`public/images/gallery/`. To replace them with real shop photos:

1. Drop your photo files into `public/images/gallery/`.
2. Keep the same numbering: `work-1.jpg`, `work-2.jpg` … `work-6.jpg`.
   Use `.jpg` (or `.png`/`.webp`) — but if you change the extension you
   must update the `src=` paths in `public/index.html` (search for
   `/images/gallery/work-`).
3. Recommended size: ~1200×900 px, < 300 KB each. Compress at
   https://squoosh.app or https://tinypng.com.
4. Suggested content (one per slot): before/after collision, paint booth,
   bumper close-up, shop interior, finished car ready for pickup.

See `public/images/gallery/README.md` for more detail.

---

## Deployment

### Vercel

- Connect the repo and deploy with default settings.
- Static files are served from `public/`.
- `/api/lead` and `/api/leads` are native Vercel functions.
- `/admin` rewrites to `/api/admin` via `vercel.json`.

### Netlify

- Publish directory: `public`
- Functions directory: `netlify/functions`
- `netlify.toml` already wires `/api/lead`, `/api/leads`, and `/admin`.

### Render / Railway / VPS

- Run `npm install`
- Run `npm start`
- The local Express server serves the landing page and API routes directly.

### Important storage note

- On classic Node hosting, the app uses local SQLite by default.
- On Vercel / Netlify serverless deployments, SQLite is not used.
- Serverless hosts fall back to JSON storage in temporary filesystem space, which is fine for crash-free demos and basic testing but not durable production storage.
- For permanent production lead storage, connect an external database or form service.

### Hooking up Google Ads conversion tracking

In `public/index.html`, search for:

```js
gtag('event','conversion',{
```

Add your `send_to: 'AW-XXXXXXXXX/XXXXXXXXX'` (your conversion ID/label
from Google Ads). Both the form submission and every phone-call link are
already wired with `data-track` attributes, so phone-call conversions are
ready to fire as soon as you paste the ID.

---

## API reference

### `POST /api/lead`

Body (JSON or urlencoded):

| field    | required | max  |
|----------|----------|------|
| name     | yes      | 80   |
| phone    | yes      | 30   |
| vehicle  | no       | 120  |
| service  | no       | 120  |
| notes    | no       | 500  |

Response: `{ ok: true, id: <number> }` on success, or
`{ ok: false, error: '...' }` on validation/rate-limit failure.

Rate-limited to 5 submissions per IP per minute.

### `GET /api/leads` *(basic auth)*

Returns the latest 500 leads as JSON.

### `GET /admin` *(basic auth)*

Simple HTML table of leads — open in a browser to view submissions.
# web-car-
