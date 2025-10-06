const { fetchClubActivities } = require('./stravaClient');
const { getEventWindow } = require('../config/eventConfig');

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

function aggregateActivities(activities, sinceTimestamp, untilTimestamp) {
  const athletes = new Map();
  const lowerBound = Number.isFinite(sinceTimestamp) ? sinceTimestamp : null;
  const upperBound = Number.isFinite(untilTimestamp) ? untilTimestamp : null;
  let earliestTimestamp = null;
  let latestTimestamp = null;

  activities.forEach((activity) => {
    if (!(activity?.type === 'Run' || activity?.type === 'Walk')) {
      return;
    }

    const activityTimestamp = parseActivityTimestamp(activity);
    if (lowerBound != null && (activityTimestamp == null || activityTimestamp < lowerBound)) {
      return;
    }
    if (upperBound != null && (activityTimestamp == null || activityTimestamp > upperBound)) {
      return;
    }

    if (activityTimestamp != null) {
      if (earliestTimestamp == null || activityTimestamp < earliestTimestamp) {
        earliestTimestamp = activityTimestamp;
      }
      if (latestTimestamp == null || activityTimestamp > latestTimestamp) {
        latestTimestamp = activityTimestamp;
      }
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
        activityCount: 0,
        firstActivityTimestamp: activityTimestamp ?? null
      });
    }

    const aggregate = athletes.get(athleteId);
    aggregate.totalDistanceMeters += distanceMeters;
    aggregate.totalMovingTimeSeconds += movingTimeSeconds;
    aggregate.activityCount += 1;
    if (activityTimestamp != null) {
      if (aggregate.firstActivityTimestamp == null || activityTimestamp < aggregate.firstActivityTimestamp) {
        aggregate.firstActivityTimestamp = activityTimestamp;
      }
    }
  });

  const leaderboard = Array.from(athletes.values())
    .map((athlete) => {
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
        total_moving_time_seconds: athlete.totalMovingTimeSeconds,
        _first_activity_timestamp: athlete.firstActivityTimestamp
      };
    })
    .sort((a, b) => {
      const aTs = a._first_activity_timestamp;
      const bTs = b._first_activity_timestamp;

      if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
        if (aTs !== bTs) {
          return aTs - bTs; // oldest first so early-day activities surface at the top
        }
      } else if (Number.isFinite(aTs)) {
        return -1;
      } else if (Number.isFinite(bTs)) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    })
    .map(({ _first_activity_timestamp: _ignore, ...athlete }) => athlete);

  return {
    leaderboard,
    earliestTimestamp,
    latestTimestamp
  };
}

async function getClubLeaderboard() {
  const activities = await fetchClubActivities();
  const eventWindow = getEventWindow();
  const eventStart = eventWindow.start instanceof Date && !Number.isNaN(eventWindow.start.getTime()) ? eventWindow.start : null;
  const eventEnd = eventWindow.end instanceof Date && !Number.isNaN(eventWindow.end.getTime()) ? eventWindow.end : null;
  const sinceTimestamp = eventWindow.startIsExplicit && eventStart ? eventStart.getTime() : null;
  const untilTimestamp = eventWindow.endIsExplicit && eventEnd ? eventEnd.getTime() : null;

  let stats = aggregateActivities(activities, sinceTimestamp, untilTimestamp);
  let eventStartIso = eventWindow.startIsExplicit && eventStart ? eventStart.toISOString() : null;
  let eventEndIso = eventWindow.endIsExplicit && eventEnd ? eventEnd.toISOString() : null;

  if (stats.leaderboard.length === 0 && (sinceTimestamp != null || untilTimestamp != null)) {
    stats = aggregateActivities(activities, null, null);
    eventStartIso = null;
    eventEndIso = null;
  }

  if (!eventStartIso && stats.earliestTimestamp != null) {
    eventStartIso = new Date(stats.earliestTimestamp).toISOString();
  }

  if (!eventEndIso && stats.latestTimestamp != null) {
    eventEndIso = new Date(stats.latestTimestamp).toISOString();
  }

  return {
    leaderboard: stats.leaderboard,
    event: {
      start: eventStartIso,
      end: eventEndIso
    }
  };
}

module.exports = {
  getClubLeaderboard
};
