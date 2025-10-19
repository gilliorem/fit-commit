const axios = require('axios');
const config = require('../config/stravaConfig');

let accessToken = null;
let accessTokenExpiresAt = 0;
let cachedActivities = [];
let cachedAt = 0;

const DEFAULT_PAGE_SIZE = (() => {
  const parsed = Number.parseInt(process.env.STRAVA_FETCH_PAGE_SIZE, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 250);
  }
  return 171; // tuned so the single-page response ends at Remi's baseline activity
})();

const DEFAULT_MAX_PAGES = (() => {
  const parsed = Number.parseInt(process.env.STRAVA_FETCH_MAX_PAGES, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 10);
  }
  return 5;
})();

const BASELINE_ATHLETE = (process.env.STRAVA_BASELINE_ATHLETE || 'Remi Gilliot').trim().toLowerCase();
const BASELINE_DISTANCE_METERS = (() => {
  const parsed = Number.parseFloat(process.env.STRAVA_BASELINE_DISTANCE_METERS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1040; // 1.04 km default
})();

const BASELINE_DISTANCE_TOLERANCE_METERS = (() => {
  const parsed = Number.parseFloat(process.env.STRAVA_BASELINE_DISTANCE_TOLERANCE_METERS);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 60; // allow minor GPS drift
})();

function matchesBaselineActivity(activity) {
  if (!activity) {
    return false;
  }

  const athlete = activity.athlete || {};
  const name = `${(athlete.firstname || '').trim()} ${(athlete.lastname || '').trim()}`
    .trim()
    .toLowerCase();
  const username = (athlete.username || '').trim().toLowerCase();
  const candidate = name || username;

  if (!candidate.includes(BASELINE_ATHLETE)) {
    return false;
  }

  const distance = Number(activity.distance);
  if (!Number.isFinite(distance)) {
    return false;
  }

  return Math.abs(distance - BASELINE_DISTANCE_METERS) <= BASELINE_DISTANCE_TOLERANCE_METERS;
}

async function refreshAccessToken() {
  const response = await axios.post('https://www.strava.com/oauth/token', {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken
  });

  const { access_token: newToken, expires_at: expiresAt } = response.data;
  accessToken = newToken;
  accessTokenExpiresAt = expiresAt ? expiresAt * 1000 : Date.now() + 1000 * 60 * 30;
  return accessToken;
}

async function getAccessToken() {
  const now = Date.now();
  if (!accessToken || now >= accessTokenExpiresAt - 60 * 1000) {
    await refreshAccessToken();
  }
  return accessToken;
}

async function fetchClubActivities() {
  const token = await getAccessToken();
  const perPage = DEFAULT_PAGE_SIZE;
  console.log("ACTIVITIES PER PAGE:", perPage);
  const maxPages = DEFAULT_MAX_PAGES;
  console.log("PAGES:", maxPages);
  const aggregated = [];
  let pagesFetched = 0;
  let baselineFound = false;

  const trimToBaseline = () => {
    const index = aggregated.findIndex((activity) => matchesBaselineActivity(activity));
    if (index >= 0) {
      aggregated.splice(index + 1);
      baselineFound = true;
    }
  };

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await axios.get(`https://www.strava.com/api/v3/clubs/${config.clubId}/activities`, {
      params: { per_page: perPage, page },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    const activities = Array.isArray(response.data) ? response.data : [];
    aggregated.push(...activities);
    pagesFetched += 1;

    if (!baselineFound) {
      trimToBaseline();
    }

    const reachedEnd = activities.length < perPage;
    const reachedLimit = page === maxPages;

    if (baselineFound) {
      break;
    }

    if (!baselineFound && (reachedEnd || reachedLimit)) {
      break;
    }
  }

  if (!baselineFound) {
    trimToBaseline();
  }

  cachedActivities = aggregated;
  cachedAt = Date.now();
  const uniqueAthleteCount = aggregated.reduce((set, activity) => {
    const athlete = activity?.athlete || {};
    const identifier = athlete.id != null
      ? String(athlete.id).trim()
      : `${(athlete.firstname || '').trim()} ${(athlete.lastname || '').trim()}`.trim();
    if (identifier && identifier !== '-') {
      set.add(identifier.toLowerCase());
    }
    return set;
  }, new Set()).size;
  console.log(
    `[Strava] Retrieved ${aggregated.length} activities across ${pagesFetched} page(s). ` +
      `Baseline found: ${baselineFound}. Unique athletes: ${uniqueAthleteCount}`
  );
  if (!baselineFound) {
    console.warn('[Strava] Baseline activity was not found in the fetched pages.');
  }
  return aggregated;
}

function getCachedActivities() {
  return {
    data: cachedActivities,
    timestamp: cachedAt
  };
}

module.exports = {
  fetchClubActivities,
  getCachedActivities,
  refreshAccessToken
};
