const fs = require('fs');
const path = require('path');

const TEAMS_CSV_PATH = path.join(__dirname, '..', 'data', 'teams.csv');

function normaliseCell(cell) {
  return cell.replace(/\r/g, '').trim();
}

function splitRow(row) {
  return row.split(',').map(normaliseCell);
}

function parseTeamsCsv(content) {
  const rows = content
    .split(/\n/) // retain order, tolerate CR removed in normaliseCell
    .map((row) => row.trimEnd())
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return [];
  }

  const headers = splitRow(rows[0]);
  const teams = headers.map((name) => ({ name, members: [] }));

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = splitRow(rows[rowIndex]);

    cells.forEach((cell, columnIndex) => {
      if (columnIndex >= teams.length) {
        return;
      }

      if (cell) {
        teams[columnIndex].members.push(cell);
      }
    });
  }

  return teams;
}

function getTeams() {
  const csv = fs.readFileSync(TEAMS_CSV_PATH, 'utf8');
  return parseTeamsCsv(csv);
}

module.exports = {
  getTeams
};
