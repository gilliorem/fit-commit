#!/usr/bin/env bash
set -euo pipefail

: "${STRAVA_ACCESS_TOKEN:?Set STRAVA_ACCESS_TOKEN with a valid Strava API access token}"
STRAVA_CLUB_ID="${STRAVA_CLUB_ID:-1764332}"
STRAVA_PER_PAGE="${STRAVA_PER_PAGE:-50}"
STRAVA_PAGE="${STRAVA_PAGE:-1}"

curl -sS -X GET "https://www.strava.com/api/v3/clubs/${STRAVA_CLUB_ID}/activities?per_page=${STRAVA_PER_PAGE}&page=${STRAVA_PAGE}" \
  -H "Authorization: Bearer ${STRAVA_ACCESS_TOKEN}" \
  -H "accept: application/json"
