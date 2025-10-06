const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = (process.env.EVENT_TIMEZONE || 'Asia/Singapore').trim();

const KNOWN_TIMEZONE_OFFSETS = {
  'asia/singapore': 8,
  'etc/utc': 0,
  utc: 0,
  'asia/kolkata': 5.5,
  'asia/hong_kong': 8,
  'asia/shanghai': 8,
  'asia/tokyo': 9
};

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractOffsetHoursFromToken(token) {
  if (!token) {
    return null;
  }

  const match = token.match(/([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return null;
  }

  const sign = match[1].startsWith('-') ? -1 : 1;
  const hours = Math.abs(parseInt(match[1], 10));
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  return sign * (hours + minutes / 60);
}

function resolveTimezoneOffsetHours(timeZone) {
  if (!timeZone) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short'
    });
    const token = formatter
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;

    const derivedHours = extractOffsetHoursFromToken(token);
    if (derivedHours != null) {
      return derivedHours;
    }
  } catch (error) {
    // Ignore and fall through to the lookup table.
  }

  const lookup = KNOWN_TIMEZONE_OFFSETS[timeZone.toLowerCase()];
  return lookup != null ? lookup : null;
}

function getOffsetHours() {
  const override = Number(process.env.EVENT_TIMEZONE_OFFSET_HOURS);
  if (Number.isFinite(override)) {
    return override;
  }

  const resolved = resolveTimezoneOffsetHours(DEFAULT_TIMEZONE);
  if (resolved != null) {
    return resolved;
  }

  return 8; // Fallback to UTC+8 (Singapore default).
}

const EVENT_OFFSET_HOURS = getOffsetHours();
const EVENT_OFFSET_MS = EVENT_OFFSET_HOURS * 60 * 60 * 1000;

function startOfTodayWithOffset(offsetMs = EVENT_OFFSET_MS) {
  const nowMs = Date.now();
  const startOfDayMs = Math.floor((nowMs + offsetMs) / DAY_IN_MS) * DAY_IN_MS;
  return new Date(startOfDayMs - offsetMs);
}

function getEventWindow() {
  const explicitStart = parseDate(process.env.EVENT_START_DATE);
  const explicitEnd = parseDate(process.env.EVENT_END_DATE);
  const startIsExplicit = explicitStart != null;
  const endIsExplicit = explicitEnd != null;

  return {
    start: explicitStart ?? null,
    end: explicitEnd ?? null,
    startIsExplicit,
    endIsExplicit
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  EVENT_OFFSET_HOURS,
  getEventWindow,
  startOfTodayWithOffset
};
