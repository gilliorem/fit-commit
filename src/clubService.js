const { fetchClubActivities } = require('./stravaClient');

function formatActivity(activity) {
  const distanceKm = activity.distance != null ? activity.distance / 1000 : 0;
const time = activity.moving_time;
	console.log(time);
  const avgSpeedKmh = (distanceKm / (time / 60)) * 60;
	console.log(avgSpeedKmh);
  const firstName = activity.athlete?.firstname || '';
  const lastName = activity.athlete?.lastname || '';
  const name = `${firstName} ${lastName}`.trim() || activity.name || 'Unknown athlete';

  return {
    name,
    distance_km: Number(distanceKm.toFixed(2)),
    avg_speed_kmh: Number(avgSpeedKmh.toFixed(2))
  };
}

async function getClubLeaderboard() {
  const activities = await fetchClubActivities();
  return activities
    .filter((activity) => activity?.type === 'Run' || activity?.type === 'Walk')
    .map(formatActivity);
}

module.exports = {
  getClubLeaderboard
};
