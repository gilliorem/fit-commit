function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  clientId: requireEnv('STRAVA_CLIENT_ID'),
  clientSecret: requireEnv('STRAVA_CLIENT_SECRET'),
  clubId: process.env.STRAVA_CLUB_ID || '1764332',
  refreshToken: requireEnv('STRAVA_REFRESH_TOKEN')
};
