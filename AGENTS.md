# Repository Guidelines

## Project Structure & Module Organization
The repo now includes an Express backend (`server.js`) and lightweight service helpers under `src/`. Frontend assets live in `public/` and are served statically. Legacy Bash tooling remains in `get_group_activities.sh` for quick API pulls. Credential setup guidance lives in `access/access.md`; follow it to load required environment variables before running scripts or the Node server. Raw API payloads are stored in the root-level `out` JSON. Working notes belong in `notes.md`, and HTML references from Strava sit under `docs/` for quick API lookup.

## Build, Test, and Development Commands
Copy `.env.example` to `.env.local`, fill in your Strava credentials, then run `npm start` to launch the Node server on port 3000. Visit `http://localhost:3000/` to see the leaderboard fed by `/api/club/activities`. Source your secret exports (e.g., `source .env.local`) before running `bash get_group_activities.sh > out` to refresh local activity data. Pretty-print the response for inspection using `jq . out`. When adjusting the shell script, run `shellcheck get_group_activities.sh` to catch common Bash issues. For bulk formatting, `shfmt -w get_group_activities.sh` keeps indentation consistent.

## Coding Style & Naming Conventions
Keep Bash scripts POSIX-compatible unless there is a compelling reason to rely on Bash-specific features; indent nested blocks with two spaces. Name helper scripts descriptively (e.g., `sync_group_stats.sh`) and keep Markdown files lowercase with hyphenated words. Document any non-trivial behavior inline with concise comments before complex pipelines.

## Testing Guidelines
There is no automated suite yet, so rely on targeted checks: validate responses with `jq` filters, and add sample payload excerpts under `docs/examples/` if creating new workflows. When extending the script, mock API calls by piping saved JSON instead of hitting the live endpoint to avoid rate limits.

## Commit & Pull Request Guidelines
Use imperative, present-tense subject lines capped at 72 characters (e.g., `Add distance filtering helper`). Describe the expected activity filtering outcome and note any credential handling changes in the body. Pull requests should link the relevant Strava ticket or club thread, summarize manual validation steps, and include screenshots of key metrics when UI tooling is involved.

## Security & Configuration Tips
Provide secrets via env vars only: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REFRESH_TOKEN` are mandatory, with optional `STRAVA_CLUB_ID`. Copy `.env.example` to `.env.local` (ignored by Git), populate values, and the server will load them automatically; CI/automation should set them directly in the environment. Rotate tokens whenever you refresh Strava credentials and update any automation that references the variables. Never commit real production secrets; instead, document any new variable names here so agents can reproduce your setup quickly.
