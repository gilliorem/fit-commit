#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const { fetchClubActivities } = require('../src/stravaClient');
const { aggregateActivities } = require('../src/activityAggregator');
const { getTeams } = require('../src/teamService');

const DISTANCE_WEEK_FILE = path.join(__dirname, '..', 'data', 'distance-week-3.csv');
const WEEK_START_ENV = 'FIT_COMMIT_WEEK_START';
const WEEK_LABEL_ENV = 'FIT_COMMIT_WEEK_LABEL';

function loadEnv() {
  dotenv.config();
  dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });
}

function resolveWeekBounds() {
  const explicitStart = process.env[WEEK_START_ENV];
  if (explicitStart) {
    const parsed = new Date(explicitStart);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `Unable to parse ${WEEK_START_ENV}=${explicitStart}. Use an ISO-8601 string, e.g. 2025-01-06T00:00:00+08:00`
      );
    }
    const end = new Date(parsed);
    end.setUTCDate(end.getUTCDate() + 7);
    return { startUtc: parsed, endUtc: end };
  }

  const now = new Date();
  const start = new Date(now);
  const dayOffset = (start.getUTCDay() + 6) % 7; // Monday as first day of week
  start.setUTCDate(start.getUTCDate() - dayOffset);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { startUtc: start, endUtc: end };
}

function tokenize(value) {
  if (!value) {
    return [];
  }

  const normalised = String(value).trim().toLowerCase();
  if (!normalised) {
    return [];
  }

  let cleaned;
  try {
    cleaned = normalised.replace(/[^\p{Letter}\p{Number}]+/gu, ' ');
  } catch (error) {
    cleaned = normalised.replace(/[^a-z0-9]+/g, ' ');
  }

  return cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function toNameKey(value) {
  return tokenize(value).join(' ');
}

function collectAthleteKeys(athlete) {
  const keys = new Set();
  const displayKey = toNameKey(athlete.name || '');
  if (displayKey) {
    keys.add(displayKey);
  }

  const combinedKey = toNameKey(`${athlete.firstName || ''} ${athlete.lastName || ''}`);
  if (combinedKey) {
    keys.add(combinedKey);
  }

  const firstTokens = tokenize(athlete.firstName || '');
  const lastTokens = tokenize(athlete.lastName || '');
  const firstToken = firstTokens[0] || '';
  const lastToken = lastTokens[lastTokens.length - 1] || '';

  if (firstToken && lastToken) {
    keys.add(`${firstToken} ${lastToken}`);
  }

  return {
    keys: Array.from(keys),
    firstToken,
    lastToken
  };
}

function buildAthleteLookup(athletes) {
  const byKey = new Map();
  const byFirstToken = new Map();
  const byInitial = new Map();

  athletes.forEach((athlete) => {
    const { keys, firstToken, lastToken } = collectAthleteKeys(athlete);

    keys.forEach((key) => {
      if (!byKey.has(key)) {
        byKey.set(key, athlete);
      }
    });

    if (firstToken) {
      if (!byFirstToken.has(firstToken)) {
        byFirstToken.set(firstToken, []);
      }
      byFirstToken.get(firstToken).push(athlete);
    }

    if (firstToken && lastToken) {
      const initialKey = `${firstToken} ${lastToken[0]}`;
      if (!byInitial.has(initialKey)) {
        byInitial.set(initialKey, athlete);
      }
    }
  });

  return { byKey, byFirstToken, byInitial };
}

function matchAthlete(memberName, lookup, usedIds) {
  const nameKey = toNameKey(memberName);
  if (!nameKey) {
    return null;
  }

  const tokens = nameKey.split(' ');

  const tryCandidate = (candidate) =>
    candidate && !usedIds.has(candidate.athleteId) ? candidate : null;

  const direct = tryCandidate(lookup.byKey.get(nameKey));
  if (direct) {
    return direct;
  }

  if (tokens.length >= 2) {
    const firstToken = tokens[0];
    const lastToken = tokens[tokens.length - 1];

    const compactKey = `${firstToken} ${lastToken}`;
    const compactCandidate = tryCandidate(lookup.byKey.get(compactKey));
    if (compactCandidate) {
      return compactCandidate;
    }

    const initialKey = `${firstToken} ${lastToken[0]}`;
    const initialCandidate = tryCandidate(lookup.byInitial.get(initialKey));
    if (initialCandidate) {
      return initialCandidate;
    }
  }

  const firstToken = tokens[0];
  const firstMatches = lookup.byFirstToken.get(firstToken) || [];
  return firstMatches.find((athlete) => !usedIds.has(athlete.athleteId)) || null;
}

function summariseUnmatched(membersByTeam) {
  const unmatched = [];
  membersByTeam.forEach((entries, teamName) => {
    entries.forEach((entry) => {
      if (!entry.match) {
        unmatched.push(`${teamName}: ${entry.member}`);
      }
    });
  });

  if (unmatched.length) {
    console.warn('[distance-week] Unmatched members:', unmatched.join('; '));
  }
}

function formatCsv(teams, perMemberRows, perDistanceRows, totals) {
  const lines = [];
  lines.push(teams.map((team) => team.name).join(','));

  for (let index = 0; index < perMemberRows.length; index += 1) {
    lines.push(perMemberRows[index].join(','));
    lines.push(perDistanceRows[index].join(','));
  }

  lines.push(totals.map((value) => value.toFixed(2)).join(','));

  return `${lines.join('\r\n')}\r\n`;
}

async function main() {
  loadEnv();
  const { startUtc, endUtc } = resolveWeekBounds();
  const label = process.env[WEEK_LABEL_ENV] || '';

  console.log('[distance-week] Resolved week window:', startUtc.toISOString(), '->', endUtc.toISOString());
  if (label) {
    console.log('[distance-week] Label:', label);
  }

  const afterEpochSeconds = Math.floor(startUtc.getTime() / 1000);
  const activities = await fetchClubActivities({ after: afterEpochSeconds, skipCache: true });
  const filteredActivities = activities.filter((activity) => {
    const startIso = activity?.start_date || activity?.start_date_local;
    if (!startIso) {
      return true; // rely on API 'after' filtering when timestamps are omitted
    }
    const timestamp = Date.parse(startIso);
    if (Number.isNaN(timestamp)) {
      return true;
    }
    return timestamp >= startUtc.getTime() && timestamp < endUtc.getTime();
  });
  console.log(
    `[distance-week] Retained ${filteredActivities.length} activities within the selected window out of ${activities.length} fetched.`
  );

  const leaderboard = aggregateActivities(filteredActivities);
  console.log('[distance-week] Aggregated athlete count:', leaderboard.length);

  const teams = getTeams();
  const lookup = buildAthleteLookup(leaderboard);
  const usedIds = new Set();

  const maxMembers = teams.reduce((max, team) => Math.max(max, team.members.length), 0);
  const memberRows = Array.from({ length: maxMembers }, () => []);
  const distanceRows = Array.from({ length: maxMembers }, () => []);
  const totals = new Array(teams.length).fill(0);
  const membershipSummary = new Map();

  teams.forEach((team) => {
    membershipSummary.set(team.name, []);
  });

  teams.forEach((team, teamIndex) => {
    for (let rowIndex = 0; rowIndex < maxMembers; rowIndex += 1) {
      const memberName = team.members[rowIndex] || '';
      memberRows[rowIndex][teamIndex] = memberName;

      if (!memberName) {
        distanceRows[rowIndex][teamIndex] = '';
        continue;
      }

      const match = matchAthlete(memberName, lookup, usedIds);
      if (match) {
        usedIds.add(match.athleteId);
        totals[teamIndex] += match.distance_km;
        distanceRows[rowIndex][teamIndex] = match.distance_km.toFixed(2);
      } else {
        distanceRows[rowIndex][teamIndex] = '';
      }

      membershipSummary.get(team.name).push({ member: memberName, match });
    }
  });

  summariseUnmatched(membershipSummary);

  const csv = formatCsv(teams, memberRows, distanceRows, totals);
  fs.writeFileSync(DISTANCE_WEEK_FILE, csv, 'utf8');
  console.log('[distance-week] Wrote', DISTANCE_WEEK_FILE);
}

main().catch((error) => {
  console.error('[distance-week] Failed to update file:', error);
  process.exitCode = 1;
});
