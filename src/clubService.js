const { fetchClubActivities } = require('./stravaClient');
const { aggregateActivities } = require('./activityAggregator');

async function getClubLeaderboard() {
  const activities = await fetchClubActivities();
  const leaderboard = aggregateActivities(activities);

  return { leaderboard };
}

module.exports = {
  getClubLeaderboard
};
