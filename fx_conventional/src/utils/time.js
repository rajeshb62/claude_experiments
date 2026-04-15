/**
 * Time utilities for banking-hours checks.
 *
 * Cross-border payments are uniquely sensitive to time zones because each institution
 * in the correspondent chain only processes during its own local business hours.
 * A payment initiated at 4pm UAE time hits a closed US correspondent bank and waits
 * overnight — this is a major source of the "3-5 business days" settlement time.
 */

// UAE is GST = UTC+4. No daylight saving.
const UAE_OFFSET_HOURS = 4;

// US Eastern (EST/EDT). Simplified to EST = UTC-5 for simulation.
// In production you'd use a proper tz library (e.g. luxon) for DST awareness.
const US_EAST_OFFSET_HOURS = -5;

// Mexico City is CST/CDT. Simplified to CST = UTC-6.
const MEXICO_OFFSET_HOURS = -6;

/**
 * Convert a UTC Date to a given UTC offset and return { dayOfWeek, hour }.
 * dayOfWeek: 0=Sun, 1=Mon ... 6=Sat
 */
function localTime(utcDate, offsetHours) {
  const localMs = utcDate.getTime() + offsetHours * 60 * 60 * 1000;
  const local = new Date(localMs);
  return {
    dayOfWeek: local.getUTCDay(), // use UTC methods on the shifted date
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    date: local,
  };
}

/**
 * UAE banking hours: Sunday–Thursday, 09:00–17:00 GST.
 * Friday/Saturday are the UAE weekend. Saudi, Kuwait, and most GCC banks follow the same calendar.
 * This is why UAE-originated SWIFT messages can't be released on Fri/Sat —
 * the originating bank's back office is closed.
 */
function isUAEBankingHours(utcDate) {
  const { dayOfWeek, hour } = localTime(utcDate, UAE_OFFSET_HOURS);
  // 0=Sun(open), 1=Mon(open), 2=Tue(open), 3=Wed(open), 4=Thu(open), 5=Fri(closed), 6=Sat(closed)
  const isWorkday = dayOfWeek >= 0 && dayOfWeek <= 4; // Sun=0 through Thu=4
  const isBusinessHour = hour >= 9 && hour < 17;
  return isWorkday && isBusinessHour;
}

/**
 * Returns the next UAE banking-hours open window after a given UTC date.
 * Used to tell senders exactly when their payment will proceed.
 */
function nextUAEBankingWindow(utcDate) {
  // Clone so we don't mutate the original
  const candidate = new Date(utcDate.getTime());

  // Advance minute by minute until we're in a valid window.
  // For a production system you'd do this algebraically, but this is clear and correct.
  for (let i = 0; i < 60 * 24 * 7; i++) {
    candidate.setTime(candidate.getTime() + 60 * 1000); // +1 minute
    if (isUAEBankingHours(candidate)) return candidate;
  }
  return null; // should never happen
}

/**
 * Hop-specific business hours check.
 * Each bank in the correspondent chain only processes during its own timezone's hours.
 * hop: 1 = UAE→US (US Eastern), 2 = US→Mexico (Mexico CST), 3 = Mexico→Local (Mexico CST)
 */
function isHopBankingHours(hop, utcDate) {
  let offset, isWorkday, isBusinessHour;

  if (hop === 1) {
    // US Eastern correspondent — Mon–Fri 09:00–17:00 EST
    const t = localTime(utcDate, US_EAST_OFFSET_HOURS);
    isWorkday = t.dayOfWeek >= 1 && t.dayOfWeek <= 5;
    isBusinessHour = t.hour >= 9 && t.hour < 17;
  } else {
    // Hops 2 & 3 — Mexican banks — Mon–Fri 09:00–17:00 CST
    const t = localTime(utcDate, MEXICO_OFFSET_HOURS);
    isWorkday = t.dayOfWeek >= 1 && t.dayOfWeek <= 5;
    isBusinessHour = t.hour >= 9 && t.hour < 17;
  }

  return isWorkday && isBusinessHour;
}

/**
 * Returns the number of calendar days between two dates, expressed as business days
 * using Mon–Fri convention (no holiday calendar — in production you'd use a bank
 * holiday schedule for each jurisdiction).
 */
function businessDaysBetween(startDate, endDate) {
  let count = 0;
  const cursor = new Date(startDate);
  while (cursor < endDate) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++; // skip Sat/Sun
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Add N business days to a date (Mon–Fri, skipping weekends).
 * Used for nostro topup settlement — ACH/wire transfers clearing takes T+2 business days.
 */
function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

module.exports = {
  isUAEBankingHours,
  nextUAEBankingWindow,
  isHopBankingHours,
  businessDaysBetween,
  addBusinessDays,
  UAE_OFFSET_HOURS,
  US_EAST_OFFSET_HOURS,
  MEXICO_OFFSET_HOURS,
};
