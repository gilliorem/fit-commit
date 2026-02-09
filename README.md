# 42 Fit-Commit Leaderboard

A Strava-powered team challenge dashboard that turns raw club activities into a **weekly competition view** and a **cumulative leaderboard**.

This project is intentionally pragmatic: it uses a small Node.js backend, CSV as a lightweight datastore, and a single static frontend page to keep deployment simple while still producing a rich, visual experience.

---

## 1) What this app does

At a high level, the app:

1. Fetches Strava club activities with OAuth token refresh.
2. Aggregates run/walk distances per athlete.
3. Matches athletes to predefined teams.
4. Writes weekly snapshots (`distance-week-*.csv`) and a cumulative view (`distances.csv`).
5. Serves a frontend leaderboard with bonus rules and team progress visuals.

The public UI only consumes `/api/distances`, meaning leaderboard rendering is decoupled from live Strava latency.

---

## 2) Why this stack was chosen (and what it implies)

### Backend: Node.js + Express

**Why it makes sense here**
- Fast to iterate for one maintainer.
- Native JSON handling and lightweight HTTP server.
- Easy interoperability with frontend JavaScript.

**Trade-offs**
- No strict typing by default (riskier refactors without tests).
- Shared mutable process state (in-memory cache/token) can become fragile in multi-instance deployments.

### HTTP client: Axios

**Why it makes sense**
- Clean API for Strava requests and token refresh calls.
- Straightforward headers/params composition.

**Trade-offs**
- Minimal retry/backoff strategy in current implementation.
- No circuit-breaking for rate limits.

### Storage model: CSV files

**Why it makes sense for this project phase**
- Human-readable and editable by non-developers.
- Zero DB setup, very easy backup/versioning.
- Great for predictable roster-shaped tables.

**Trade-offs**
- Parsing logic is custom and brittle to format drift.
- Hard to enforce data integrity and history semantics.
- Concurrent writes are not managed.

### Frontend: Single HTML file with inline CSS/JS

**Why it makes sense**
- One-file deploy simplicity.
- No build step.
- Easy to inspect and adjust visuals quickly.

**Trade-offs**
- File grows large and mixes concerns (style, logic, markup).
- Harder testability and maintainability over time.
- No module boundaries for UI state.

---

## 3) Architecture and data flow

```text
Strava API
   │
   ▼
src/stravaClient.js (token refresh + paged fetch + baseline trimming)
   │
   ▼
src/activityAggregator.js (Run/Walk aggregation by athlete)
   │
   ▼
scripts/updateDistanceWeek.js
   ├─ writes weekly snapshot: data/distance-week-N.csv
   └─ rebuilds cumulative:   data/distances.csv

Express API
   └─ /api/distances  -> src/distanceService.js

Frontend
   └─ public/index.html fetch('/api/distances') and renders leaderboard
```

### Runtime APIs
- `GET /api/club/activities`: on-demand aggregated athlete leaderboard from Strava.
- `GET /api/teams`: team roster from `data/teams.csv` (plus hard-coded overrides).
- `GET /api/distances`: cumulative precomputed data from `data/distances.csv`.

The most important practical design decision: **the UI is driven by precomputed CSV (`/api/distances`) rather than live Strava pulls**. That makes the dashboard stable and fast.

---

## 4) Directory hierarchy (and why it is structured this way)

```text
.
├─ server.js                    # Express entrypoint and routes
├─ config/
│  └─ stravaConfig.js           # env-backed Strava credentials
├─ src/
│  ├─ stravaClient.js           # Strava auth + activity fetch/cache
│  ├─ activityAggregator.js     # athlete-level run/walk aggregation
│  ├─ clubService.js            # service orchestration for club leaderboard
│  ├─ teamService.js            # team CSV parsing + overrides
│  └─ distanceService.js        # distances CSV parsing for frontend API
├─ scripts/
│  └─ updateDistanceWeek.js     # weekly snapshot + cumulative rebuild
├─ data/
│  ├─ teams.csv                 # source-of-truth roster layout
│  ├─ distance-week-*.csv       # weekly snapshots
│  └─ distances.csv             # cumulative, UI-facing file
├─ public/
│  └─ index.html                # UI (HTML/CSS/JS)
├─ img/                         # static assets
├─ docs/                        # Strava API reference dump
└─ access/                      # token/access operational notes
```

This structure is cleanly split by concern (server/services/data/frontend), which is good for a small codebase. The weak spot is that parsing and matching logic exists in multiple places (script + frontend), which can diverge.

---

## 5) Critical components and how they interact

### A) `src/stravaClient.js` — token refresh, pagination, and baseline trimming

This file is core to freshness and correctness. It:
- refreshes access tokens with `refresh_token` grant,
- paginates club activities,
- trims fetched activities at a “baseline activity” marker,
- caches fetched activities in memory.

Example (simplified):

```js
async function getAccessToken() {
  const now = Date.now();
  if (!accessToken || now >= accessTokenExpiresAt - 60 * 1000) {
    await refreshAccessToken();
  }
  return accessToken;
}
```

Why this matters: if token refresh fails, the entire ingestion path fails.

### B) `src/activityAggregator.js` — ranking semantics

This module currently filters to `Run` and `Walk`, sums distances and moving time, and sorts by **earliest activity timestamp** (not highest distance), then name.

```js
if (!(activity?.type === 'Run' || activity?.type === 'Walk')) {
  return;
}
```

This is a surprising but intentional ranking semantic; if the product expectation is “who ran the most,” sorting should move to distance-first.

### C) `scripts/updateDistanceWeek.js` — the data production pipeline

This is the most critical operational script. It:
- computes week bounds,
- fetches activities after week start,
- aggregates and fuzzy-matches athletes to team members,
- writes the weekly snapshot,
- rebuilds cumulative totals from all snapshots.

If this script is not run, `/api/distances` becomes stale.

### D) `public/index.html` — scoring rules and rendering

The UI applies a bonus rule (+50 km) when all team members have matched activities.

```js
const hasBonus = memberCount >= 5 && members.every((member) => member.athlete);
const bonusKm = hasBonus ? 50 : 0;
const adjustedDistance = baseDistance + bonusKm;
```

Important implication: part of business logic lives client-side. If consumers rely on API data outside the UI, they may not see the same ranking unless they replicate this rule.

---

## 6) Data model explained

### `teams.csv`
- First row: team names (columns).
- Following rows: roster slots per team.

### `distance-week-N.csv`
- Row 1: team headers.
- Then alternating row pairs:
  - member names row
  - same-row distances row
- Last row: team totals.

### `distances.csv`
- Same matrix-like format as snapshots.
- Rebuilt cumulatively from all weekly snapshots.
- Loaded by `/api/distances` for display.

This is clever for human editability, but structurally awkward for machines. A JSON or relational model would reduce parser complexity.

---

## 7) Security and operational critique (important)

### Immediate issue: secrets hardcoded in `get_group_activities.sh`

The repository currently contains values that look like real Strava credentials/tokens in shell script variables. This is a critical security smell.

**What should be done immediately**
1. Revoke/rotate all exposed tokens and secrets.
2. Remove hardcoded values from tracked files.
3. Keep credentials only in `.env.local` (gitignored) or secret manager.
4. Add secret scanning in CI (e.g., Gitleaks).

You already have good guidance in `access/access.md`; implementation should match that guidance everywhere.

---

## 8) Current limits of the app

1. **No persistence guarantees beyond files**
   - CSV can be overwritten accidentally.
   - No transaction/lock mechanism.

2. **No automated tests**
   - Matching/sorting regressions are easy to introduce.

3. **Single-process assumptions**
   - In-memory cache/token state in `stravaClient.js` is not shared across replicas.

4. **Business logic split across layers**
   - Bonus and matching logic appears in both script and frontend.
   - Risk of divergence.

5. **Fragile fuzzy matching**
   - Name collisions and aliases can still mismatch.

6. **Error handling is basic**
   - No robust retry/jitter or explicit Strava rate-limit strategy.

---

## 9) How this could be improved (opinionated)

### Improvement 1: Centralize scoring and matching rules server-side
- Create one domain module (`src/scoring/`) used by script + API.
- Frontend should render provided computed fields only.

### Improvement 2: Move from CSV to a lightweight DB
- SQLite is a great intermediate step.
- Keep export-to-CSV as optional output for stakeholders.

### Improvement 3: Add tests around the critical paths
- Unit tests for name matching, CSV parse/format, bonus logic, ranking order.
- Snapshot tests for generated CSV shape.

### Improvement 4: Separate frontend concerns
- Extract JS into `public/app.js` and CSS into `public/styles.css`.
- Keep `index.html` mostly semantic markup.

### Improvement 5: Add scheduled job automation
- Run `npm run update:week` on a cron (or CI scheduled workflow).
- Include alerting when unmatched members spike.

### Improvement 6: Observability
- Structured logs with event context (`week`, `teamCount`, `unmatchedCount`).
- Add health endpoint and basic metrics.

---

## 10) Growth roadmap

### Short term (1–2 weeks)
- Secret cleanup and credential rotation.
- Add regression tests for parsers/matchers.
- Move duplicated matching code into shared utility.

### Mid term (1–2 months)
- Add SQLite storage + migration script from CSV.
- Expose typed API contract for frontend.
- Introduce daily/weekly automated ingestion job.

### Long term
- Multi-club support.
- Admin UI for aliases, overrides, and week boundaries.
- Historical analytics (trend lines, participation rates, consistency scores).

---

## 11) Local setup

```bash
npm install
```

Create local env file (not committed):

```bash
cat <<'ENV' > .env.local
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
STRAVA_CLUB_ID=1764332
ENV
```

Start server:

```bash
npm start
```

Weekly snapshot update:

```bash
npm run update:week
```

Optional controls:
- `FIT_COMMIT_WEEK_START` (ISO date-time with timezone)
- `FIT_COMMIT_WEEK_NUMBER` or `FIT_COMMIT_WEEK_FILE`
- `STRAVA_FETCH_PAGE_SIZE`, `STRAVA_FETCH_MAX_PAGES`

---

## 12) Final assessment

This is a **strong prototype/production-lite** application: focused, understandable, and deployable with minimal ops burden. The biggest wins are simplicity and transparency. The biggest risks are security hygiene, duplicated domain logic, and CSV-scale limits.

If you expect this to remain a small internal challenge board, the architecture is absolutely valid. If you expect larger scale, multiple operators, or stricter correctness, you should migrate toward centralized domain logic, tested pipelines, and a proper datastore.

