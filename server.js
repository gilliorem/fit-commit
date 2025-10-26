const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
const express = require('express');
const { getClubLeaderboard } = require('./src/clubService');
const { getTeams } = require('./src/teamService');
const { getCachedActivities } = require('./src/stravaClient');
const { getDistances } = require('./src/distanceService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(path.join(__dirname, 'img')));

app.get('/api/club/activities', async (req, res) => {
  try {
    const { leaderboard } = await getClubLeaderboard();
    res.json({
      activities: leaderboard,
      cachedAt: getCachedActivities().timestamp
    });
  } catch (error) {
    console.error('Failed to fetch club activities', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch club activities from Strava.' });
  }
});

app.get('/api/teams', (req, res) => {
  try {
    const teams = getTeams();
    res.json({ teams });
  } catch (error) {
    console.error('Failed to load teams configuration', error.message);
    res.status(500).json({ error: 'Failed to load teams configuration.' });
  }
});

app.get('/api/distances', (req, res) => {
  try {
    const payload = getDistances();
    res.json(payload);
  } catch (error) {
    console.error('Failed to load distances CSV', error.message);
    res.status(500).json({ error: 'Failed to load distances data.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
