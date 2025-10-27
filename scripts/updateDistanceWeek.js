#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
  dotenv.config();
  dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });
}

loadEnv();

const { fetchClubActivities } = require('../src/stravaClient');
const { aggregateActivities } = require('../src/activityAggregator');
const { getTeams } = require('../src/teamService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DISTANCES_FILE = path.join(DATA_DIR, 'distances.csv');
const WEEKLY_SNAPSHOT_PATTERN = /^distance-week-(\d+)\.csv$/;
const WEEK_START_ENV = 'FIT_COMMIT_WEEK_START';
const WEEK_LABEL_ENV = 'FIT_COMMIT_WEEK_LABEL';
const WEEK_FILE_ENV = 'FIT_COMMIT_WEEK_FILE';
const WEEK_NUMBER_ENV = 'FIT_COMMIT_WEEK_NUMBER';

function resolveDistanceWeekFile() {
  const explicitFile = (process.env[WEEK_FILE_ENV] || '').trim();
  if (explicitFile) {
    return path.join(DATA_DIR, explicitFile);
  }

  const explicitNumber = (process.env[WEEK_NUMBER_ENV] || '').trim();
  if (explicitNumber) {
    const parsed = Number.parseInt(explicitNumber, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `Unable to parse ${WEEK_NUMBER_ENV}=${explicitNumber}. Provide a positive integer week number.`
      );
    }
    return path.join(DATA_DIR, `distance-week-${parsed}.csv`);
  }

  const snapshotFiles = getWeeklySnapshotFiles();
  if (snapshotFiles.length === 0) {
    return path.join(DATA_DIR, 'distance-week-1.csv');
  }

  return path.join(DATA_DIR, snapshotFiles[snapshotFiles.length - 1]);
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

function splitRow(row, expectedLength) {
  const cells = row
    .split(',')
    .map((cell) => cell.replace(/\r/g, '').trim());

  if (Number.isInteger(expectedLength) && expectedLength > 0) {
    while (cells.length < expectedLength) {
      cells.push('');
    }
    if (cells.length > expectedLength) {
      cells.length = expectedLength;
    }
  }

  return cells;
}

function isNumericCell(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric);
}

function isTotalsRow(cells) {
  return cells.every((cell) => !cell || isNumericCell(cell));
}

function formatDistanceCell(value, { zeroAsBlank }) {
  if (value == null || value === '') {
    return '';
  }

  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) {
    return '';
  }

  if (zeroAsBlank && numeric === 0) {
    return '';
  }

  return numeric.toFixed(2);
}

function createMatrix(rows, columns, initialValue = 0) {
  return Array.from({ length: rows }, () => new Array(columns).fill(initialValue));
}

function getWeeklySnapshotFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  return fs
    .readdirSync(DATA_DIR)
    .map((entry) => {
      const match = entry.match(WEEKLY_SNAPSHOT_PATTERN);
      if (!match) {
        return null;
      }
      return {
        name: entry,
        week: Number.parseInt(match[1], 10)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.week - b.week)
    .map((entry) => entry.name);
}

function accumulateWeeklySnapshot(filePath, accumulator, teamCount, maxMembers) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content
    .split(/\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return;
  }

  let rowIndex = 0;
  for (let lineIndex = 1; lineIndex < lines.length && rowIndex < maxMembers; ) {
    const nameCells = splitRow(lines[lineIndex], teamCount);
    if (isTotalsRow(nameCells)) {
      break;
    }

    const distanceLine = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : '';
    const distanceCells = splitRow(distanceLine, teamCount);

    for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
      const cellValue = distanceCells[teamIndex];
      if (!isNumericCell(cellValue)) {
        continue;
      }
      const existing = accumulator[rowIndex][teamIndex] || 0;
      const nextValue = existing + Number.parseFloat(cellValue);
      accumulator[rowIndex][teamIndex] = Number(nextValue.toFixed(2));
    }

    rowIndex += 1;
    lineIndex += 2;
  }
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
    const memberLine = perMemberRows[index].map((cell) => cell || '');
    const distanceLine = perDistanceRows[index].map((value) => formatDistanceCell(value, { zeroAsBlank: true }));

    lines.push(memberLine.join(','));
    lines.push(distanceLine.join(','));
  }

  const totalsLine = totals.map((value) => formatDistanceCell(value, { zeroAsBlank: false }));
  lines.push(totalsLine.join(','));

  return `${lines.join('\r\n')}\r\n`;
}

function rebuildCumulativeDistances(teams, memberRows, maxMembers) {
  const teamCount = teams.length;
  const snapshotFiles = getWeeklySnapshotFiles();

  if (snapshotFiles.length === 0) {
    console.warn('[distance-week] No weekly snapshot CSV files found. Skipping cumulative rebuild.');
    return;
  }

  const accumulator = createMatrix(maxMembers, teamCount, 0);

  snapshotFiles.forEach((fileName) => {
    const filePath = path.join(DATA_DIR, fileName);
    try {
      accumulateWeeklySnapshot(filePath, accumulator, teamCount, maxMembers);
    } catch (error) {
      console.warn(`[distance-week] Skipped malformed snapshot ${fileName}:`, error.message);
    }
  });

  const totals = new Array(teamCount).fill(0);
  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    let sum = 0;
    for (let rowIndex = 0; rowIndex < maxMembers; rowIndex += 1) {
      const value = accumulator[rowIndex][teamIndex];
      if (Number.isFinite(value)) {
        sum += value;
      }
    }
    totals[teamIndex] = Number(sum.toFixed(2));
  }

  const aggregateCsv = formatCsv(teams, memberRows, accumulator, totals);
  fs.writeFileSync(DISTANCES_FILE, aggregateCsv, 'utf8');
  console.log('[distance-week] Wrote', DISTANCES_FILE);
  console.log('[distance-week] Frontpage data refreshed from snapshots:', snapshotFiles.join(', '));
}

async function main() {
  loadEnv();
  const { startUtc, endUtc } = resolveWeekBounds();
  const label = process.env[WEEK_LABEL_ENV] || '';
  const distanceWeekFile = resolveDistanceWeekFile();

  console.log('[distance-week] Resolved week window:', startUtc.toISOString(), '->', endUtc.toISOString());
  if (label) {
    console.log('[distance-week] Label:', label);
  }
  console.log('[distance-week] Snapshot file:', path.basename(distanceWeekFile));

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
  const memberRows = createMatrix(maxMembers, teams.length, '');
  const distanceRows = createMatrix(maxMembers, teams.length, null);
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
        distanceRows[rowIndex][teamIndex] = null;
        continue;
      }

      const match = matchAthlete(memberName, lookup, usedIds);
      if (match) {
        usedIds.add(match.athleteId);
        totals[teamIndex] += match.distance_km;
        distanceRows[rowIndex][teamIndex] = match.distance_km;
      } else {
        distanceRows[rowIndex][teamIndex] = null;
      }

      membershipSummary.get(team.name).push({ member: memberName, match });
    }
  });

  for (let teamIndex = 0; teamIndex < totals.length; teamIndex += 1) {
    totals[teamIndex] = Number(totals[teamIndex].toFixed(2));
  }

  summariseUnmatched(membershipSummary);

  const csv = formatCsv(teams, memberRows, distanceRows, totals);
  fs.writeFileSync(distanceWeekFile, csv, 'utf8');
  console.log('[distance-week] Wrote', distanceWeekFile);

  rebuildCumulativeDistances(teams, memberRows, maxMembers);
}

main().catch((error) => {
  console.error('[distance-week] Failed to update file:', error);
  process.exitCode = 1;
});
