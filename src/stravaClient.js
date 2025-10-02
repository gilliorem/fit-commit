const axios = require('axios');
const config = require('../config/stravaConfig');

let accessToken = null;
let accessTokenExpiresAt = 0;
let cachedActivities = [];
let cachedAt = 0;

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
  const response = await axios.get(`https://www.strava.com/api/v3/clubs/${config.clubId}/activities`, {
    params: { per_page: 50, page: 1 },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  cachedActivities = response.data;
  cachedAt = Date.now();
  return response.data;
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
