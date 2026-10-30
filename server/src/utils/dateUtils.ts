/**
 * Asia/Kolkata (IST) Date and Time Utilities
 * India Standard Time is UTC +05:30 with zero DST variation.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5 hours 30 minutes in ms

/**
 * Returns the IST calendar day string 'YYYY-MM-DD' for a given timestamp.
 */
export function getISTDayKey(dateInput?: Date | string | number | null): string {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  // Fast formatting via Intl in 'Asia/Kolkata'
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // Formats as 'YYYY-MM-DD'
}

/**
 * Returns UTC Date boundaries for an IST calendar day 'YYYY-MM-DD'.
 * 00:00:00.000 IST to 23:59:59.999 IST.
 */
export function getISTDayRange(dayKey?: string): { start: Date; end: Date; dayKey: string } {
  const key = dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : getISTDayKey();
  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  // UTC midnight for the IST calendar date minus 5h 30m
  const startUtcMs = Date.UTC(year, monthIndex, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endUtcMs = Date.UTC(year, monthIndex, day, 23, 59, 59, 999) - IST_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    dayKey: key,
  };
}

/**
 * Resolves the official call start date and IST day key with device clock skew protection.
 * If client timestamp skew exceeds 5 minutes compared to serverReceivedAt,
 * server time is used as source of truth for day bucketing and clockSkewWarning is flagged.
 */
export function resolveCallDate(
  clientTimestamp?: string | Date | number | null,
  serverReceivedAt: Date = new Date(),
): {
  callDate: Date;
  dayIST: string;
  clockSkewMinutes: number;
  clockSkewWarning: boolean;
} {
  const serverMs = serverReceivedAt.getTime();
  let clientDate: Date | null = null;

  if (clientTimestamp) {
    const parsed = new Date(clientTimestamp);
    if (!isNaN(parsed.getTime())) {
      clientDate = parsed;
    }
  }

  if (!clientDate) {
    return {
      callDate: serverReceivedAt,
      dayIST: getISTDayKey(serverReceivedAt),
      clockSkewMinutes: 0,
      clockSkewWarning: false,
    };
  }

  const diffMs = Math.abs(serverMs - clientDate.getTime());
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const isSkewed = diffMinutes > 5;

  // If skew > 5 minutes, guard against incorrect past/future day bucketing
  const officialDate = isSkewed ? serverReceivedAt : clientDate;
  const dayIST = getISTDayKey(officialDate);

  return {
    callDate: officialDate,
    dayIST,
    clockSkewMinutes: diffMinutes,
    clockSkewWarning: isSkewed,
  };
}
