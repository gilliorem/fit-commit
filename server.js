const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
const express = require('express');
const { getClubLeaderboard } = require('./src/clubService');
const { getCachedActivities } = require('./src/stravaClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/club/activities', async (req, res) => {
  try {
    const activities = await getClubLeaderboard();
    res.json({
      activities,
      cachedAt: getCachedActivities().timestamp
    });
  } catch (error) {
    console.error('Failed to fetch club activities', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch club activities from Strava.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
