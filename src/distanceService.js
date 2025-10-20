const fs = require('fs');
const path = require('path');

const DISTANCES_CSV_PATH = path.join(__dirname, '..', 'data', 'distances.csv');

function splitRow(row) {
  return row.split(',').map((cell) => cell.replace(/\r/g, '').trim());
}

function isNumeric(value) {
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

function parseDistancesCsv(content) {
  const rows = content
    .split(/\n/)
    .map((row) => row.trimEnd())
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return [];
  }

  const headers = splitRow(rows[0]);
  const teams = headers.map((name) => ({
    name,
    members: [],
    totalDistance: 0
  }));

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 2) {
    const nameRow = splitRow(rows[rowIndex] || '');
    const distanceRow = splitRow(rows[rowIndex + 1] || '');

    const isTotalsRow = nameRow.every((cell) => !cell || isNumeric(cell));
    const isDistanceRowEmpty = distanceRow.every((cell) => !cell);

    if (isTotalsRow && isDistanceRowEmpty) {
      nameRow.forEach((cell, columnIndex) => {
        if (isNumeric(cell)) {
          teams[columnIndex].totalDistance = Number.parseFloat(cell);
        }
      });
      break;
    }

    const isNameRowEmpty = nameRow.every((cell) => !cell);

    if (isNameRowEmpty && isDistanceRowEmpty) {
      continue;
    }

    for (let columnIndex = 0; columnIndex < teams.length; columnIndex += 1) {
      const memberName = nameRow[columnIndex] || '';
      const distanceCell = distanceRow[columnIndex] || '';

      if (!memberName) {
        continue;
      }

      const hasDistance = isNumeric(distanceCell);
      const distanceValue = hasDistance ? Number.parseFloat(distanceCell) : null;

      if (hasDistance) {
        teams[columnIndex].totalDistance += distanceValue;
      }

      teams[columnIndex].members.push({
        memberName,
        displayName: hasDistance ? memberName : `${memberName} (NR)`,
        distance_km: hasDistance ? Number(distanceValue.toFixed(2)) : null,
        athlete: hasDistance
          ? {
              athleteId: null,
              name: memberName,
              distance_km: Number(distanceValue.toFixed(2)),
              avg_speed_kmh: 0
            }
          : null
      });
    }
  }

  teams.forEach((team) => {
    team.totalDistance = Number(team.totalDistance.toFixed(2));
  });

  return teams;
}

function getDistances() {
  const csv = fs.readFileSync(DISTANCES_CSV_PATH, 'utf8');
  const teams = parseDistancesCsv(csv);
  const stats = fs.statSync(DISTANCES_CSV_PATH);

  return {
    generatedAt: stats.mtime.toISOString(),
    teams
  };
}

module.exports = {
  getDistances
};
