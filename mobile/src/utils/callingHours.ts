/**
 * Legal calling hours regulatory utility (India TRAI Standards: 09:00 - 20:00 IST).
 * Prevents telecallers from inadvertently scheduling follow-ups during anti-social hours.
 */

export const adjustForCallingHours = (
  date: Date,
  startHour = 9,
  startMinute = 30,
  endHour = 20,
): Date => {
  const adjusted = new Date(date);
  const hours = adjusted.getHours();
  const minutes = adjusted.getMinutes();
  const decimalHour = hours + minutes / 60;

  // If after evening cut-off (20:00 / 8:00 PM)
  if (decimalHour >= endHour) {
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(startHour, startMinute, 0, 0);
    return adjusted;
  }

  // If before morning cut-off (09:00 AM)
  if (decimalHour < startHour) {
    adjusted.setHours(startHour, startMinute, 0, 0);
    return adjusted;
  }

  return adjusted;
};

export const isWithinCallingHours = (
  date: Date,
  startHour = 9,
  endHour = 20,
): boolean => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const decimalHour = hours + minutes / 60;
  return decimalHour >= startHour && decimalHour < endHour;
};

/**
 * Returns a recommended follow-up ISO string (+2 hours by default,
 * rolled over to 09:30 AM tomorrow if falling after 8:00 PM).
 */
export const getDefaultFollowUpIso = (hoursAhead = 2): string => {
  const d = new Date();
  d.setTime(d.getTime() + hoursAhead * 60 * 60 * 1000);
  return adjustForCallingHours(d).toISOString();
};
