const DEFAULT_START = '2024-10-06T00:00:00.000Z';
const DEFAULT_END = '2024-11-03T23:59:59.999Z';

function parseInstant(value, fallback) {
  if (!value) {
    return fallback ?? null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback ?? null;
  }
  return date;
}

const eventStart = parseInstant(process.env.EVENT_START_DATE, parseInstant(DEFAULT_START));
const eventEnd = parseInstant(process.env.EVENT_END_DATE, parseInstant(DEFAULT_END));

module.exports = {
  eventStart,
  eventEnd
};
