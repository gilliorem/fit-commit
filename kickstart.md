# Kickstart (Bare Minimum)

This is the fastest possible way to run a tiny localhost web app that does exactly this:

1. Fetch one Strava user (athlete)
2. Fetch that user’s distance (sum of recent activities)
3. Update a database row
4. Render result on `http://localhost:3000`

No extras. No architecture. No refactor. No UI framework.

---

## 0) Minimal stack

Use:
- Node.js
- Express
- Axios
- SQLite (`better-sqlite3`)
- Dotenv

That’s all.

---

## 1) Create a clean folder

```bash
mkdir strava-min
cd strava-min
npm init -y
npm i express axios better-sqlite3 dotenv
```

---

## 2) Add environment file

Create `.env`:

```env
STRAVA_ACCESS_TOKEN=your_access_token_here
PORT=3000
```

> Use a valid Strava token with permission to read athlete/activity data.

---

## 3) Add the entire app in one file

Create `server.js`:

```js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.STRAVA_ACCESS_TOKEN;

if (!token) {
  console.error('Missing STRAVA_ACCESS_TOKEN in .env');
  process.exit(1);
}

// --- DB init (single table) ---
const db = new Database('app.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS athlete_stats (
    athlete_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    total_distance_km REAL NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// --- Small Strava client helpers ---
async function fetchAthlete() {
  const res = await axios.get('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

async function fetchAthleteActivities(page = 1, perPage = 30) {
  const res = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
    headers: { Authorization: `Bearer ${token}` },
    params: { page, per_page: perPage }
  });
  return Array.isArray(res.data) ? res.data : [];
}

function sumDistanceKm(activities) {
  let meters = 0;
  for (const activity of activities) {
    // Keep it simple: all activity types included
    const d = Number(activity?.distance || 0);
    if (Number.isFinite(d) && d > 0) meters += d;
  }
  return Number((meters / 1000).toFixed(2));
}

function upsertAthleteStat({ athleteId, name, totalDistanceKm }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO athlete_stats (athlete_id, name, total_distance_km, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(athlete_id)
    DO UPDATE SET
      name = excluded.name,
      total_distance_km = excluded.total_distance_km,
      updated_at = excluded.updated_at
  `);
  stmt.run(athleteId, name, totalDistanceKm, now);
}

function readAthleteStat(athleteId) {
  const stmt = db.prepare('SELECT * FROM athlete_stats WHERE athlete_id = ?');
  return stmt.get(athleteId);
}

// --- Route: sync from Strava then show HTML ---
app.get('/', async (_req, res) => {
  try {
    const athlete = await fetchAthlete();
    const activities = await fetchAthleteActivities(1, 50); // recent 50 activities max
    const totalDistanceKm = sumDistanceKm(activities);

    const athleteId = athlete.id;
    const fullName = `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim() || 'Unknown athlete';

    upsertAthleteStat({
      athleteId,
      name: fullName,
      totalDistanceKm
    });

    const row = readAthleteStat(athleteId);

    res.type('html').send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Strava Minimal</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 2rem; max-width: 720px; }
            .card { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; }
            .muted { color: #666; }
            button { margin-top: 1rem; padding: 0.5rem 0.8rem; }
          </style>
        </head>
        <body>
          <h1>Strava Minimal Dashboard</h1>
          <div class="card">
            <p><strong>Athlete:</strong> ${row.name}</p>
            <p><strong>Total distance (recent activities):</strong> ${row.total_distance_km} km</p>
            <p class="muted"><strong>Updated:</strong> ${row.updated_at}</p>
          </div>
          <form method="GET" action="/">
            <button type="submit">Refresh from Strava</button>
          </form>
        </body>
      </html>
    `);
  } catch (error) {
    const msg = error?.response?.data || error.message;
    console.error('Failed:', msg);
    res.status(500).send(`Error talking to Strava: ${JSON.stringify(msg)}`);
  }
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});
```

This single file is enough for the full flow.

---

## 4) Run

```bash
node server.js
```

Open:

```txt
http://localhost:3000
```

Each page load does:
- Strava fetch (`/athlete` + `/athlete/activities`)
- Distance sum
- DB upsert
- HTML render

---

## 5) Verify quickly

- If you see athlete name + distance + updated timestamp, you are done.
- If token is invalid, fix `.env` and restart.

---

## 6) Why this is the minimum

- One app file
- One table
- One route
- No background jobs
- No auth layer
- No frontend build tools

That is the bare minimum that satisfies your requirements and runs on localhost.

