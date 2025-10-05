const { fetchClubActivities } = require('./stravaClient');
const { eventStart, eventEnd } = require('../config/eventConfig');

function toNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function selectAthleteName(activity) {
  const firstName = (activity.athlete?.firstname || '').trim();
  const lastName = (activity.athlete?.lastname || '').trim();
  const parts = [firstName, lastName].filter(Boolean);

  if (parts.length > 0) {
    return {
      firstName,
      lastName,
      fullName: parts.join(' ')
    };
  }

  const fallback = (activity.athlete?.username || activity.name || '').trim();

  return {
    firstName: '',
    lastName: '',
    fullName: fallback || 'Unidentified Athlete'
  };
}

function parseActivityTimestamp(activity) {
  const timestamp = Date.parse(activity?.start_date ?? activity?.start_date_local ?? '');
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isWithinEventWindow(timestamp) {
  if (timestamp == null) {
    return false;
  }

  if (eventStart instanceof Date && !Number.isNaN(eventStart.getTime())) {
    if (timestamp < eventStart.getTime()) {
      return false;
    }
  }

  if (eventEnd instanceof Date && !Number.isNaN(eventEnd.getTime())) {
    if (timestamp > eventEnd.getTime()) {
      return false;
    }
  }

  return true;
}

function aggregateActivities(activities) {
  const athletes = new Map();

  activities.forEach((activity) => {
    if (!(activity?.type === 'Run' || activity?.type === 'Walk')) {
      return;
    }

    const activityTimestamp = parseActivityTimestamp(activity);
    if (!isWithinEventWindow(activityTimestamp)) {
      return;
    }

    const athleteId = activity.athlete?.id ?? `${activity.athlete?.firstname || ''}-${activity.athlete?.lastname || ''}`;
    const nameInfo = selectAthleteName(activity);

    const distanceMeters = toNumber(activity.distance);
    const movingTimeSeconds = toNumber(activity.moving_time);

    if (!athletes.has(athleteId)) {
      athletes.set(athleteId, {
        athleteId,
        fullName: nameInfo.fullName,
        firstName: nameInfo.firstName,
        lastName: nameInfo.lastName,
        totalDistanceMeters: 0,
        totalMovingTimeSeconds: 0,
        activityCount: 0
      });
    }

    const aggregate = athletes.get(athleteId);
    aggregate.totalDistanceMeters += distanceMeters;
    aggregate.totalMovingTimeSeconds += movingTimeSeconds;
    aggregate.activityCount += 1;
  });

  return Array.from(athletes.values()).map((athlete) => {
    const distanceKm = athlete.totalDistanceMeters / 1000;
    const movingTimeHours = athlete.totalMovingTimeSeconds / 3600;
    const avgSpeedKmh = movingTimeHours > 0 ? distanceKm / movingTimeHours : 0;

    return {
      athleteId: athlete.athleteId,
      name: athlete.fullName,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      distance_km: Number(distanceKm.toFixed(2)),
      avg_speed_kmh: Number(avgSpeedKmh.toFixed(2)),
      activity_count: athlete.activityCount,
      total_moving_time_seconds: athlete.totalMovingTimeSeconds
    };
  });
}

async function getClubLeaderboard() {
  const activities = await fetchClubActivities();
  return {
    leaderboard: aggregateActivities(activities),
    event: {
      start: eventStart instanceof Date && !Number.isNaN(eventStart.getTime()) ? eventStart.toISOString() : null,
      end: eventEnd instanceof Date && !Number.isNaN(eventEnd.getTime()) ? eventEnd.toISOString() : null
    }
  };
}

module.exports = {
  getClubLeaderboard
};
