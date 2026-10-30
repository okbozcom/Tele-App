/**
 * Asia/Kolkata (IST) Date and Time Utilities for Mobile/Web Client
 * India Standard Time is UTC +05:30 with zero DST variation.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns the IST calendar day string 'YYYY-MM-DD' for a given timestamp.
 */
export function getISTDayKey(dateInput?: Date | string | number | null): string {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback using direct offset calculation
    const istTime = new Date(date.getTime() + IST_OFFSET_MS);
    return istTime.toISOString().slice(0, 10);
  }
}

/**
 * Returns UTC Date boundaries for an IST calendar day 'YYYY-MM-DD'.
 */
export function getISTDayRange(dayKey?: string): { start: Date; end: Date; dayKey: string } {
  const key = dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : getISTDayKey();
  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const startUtcMs = Date.UTC(year, monthIndex, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endUtcMs = Date.UTC(year, monthIndex, day, 23, 59, 59, 999) - IST_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    dayKey: key,
  };
}
