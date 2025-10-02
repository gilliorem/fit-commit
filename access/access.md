# API Settings and Access Tokens

All Strava credentials must be supplied via environment variables rather than committed files. The root `get_group_activities.sh` script reads the following variables at runtime:

- `STRAVA_ACCESS_TOKEN`
- `STRAVA_REFRESH_TOKEN`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_CLUB_ID` (optional, defaults to `1764332`)

Export them in your shell session, source a private `.env.local` file that is ignored by Git, or configure a secrets manager in your automation environment. Example local setup:

```bash
cat <<'ENV' > .env.local
export STRAVA_CLIENT_ID="your-client-id"
export STRAVA_CLIENT_SECRET="your-client-secret"
export STRAVA_REFRESH_TOKEN="your-refresh-token"
export STRAVA_ACCESS_TOKEN="your-short-lived-access-token"
export STRAVA_CLUB_ID="1764332"
ENV

source .env.local
```

Generate and refresh tokens through the Strava API console. Whenever you rotate credentials, update your private `.env.local` (or secrets store) and restart any processes that depend on the variables. Never commit real tokens or client secrets to the repository.
