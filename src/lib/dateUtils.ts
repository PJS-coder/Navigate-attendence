/**
 * src/lib/dateUtils.ts
 *
 * Timezone-safe date & time helpers for IST (Asia/Kolkata, UTC+05:30).
 * Guarantees 100% consistent date matching and time-window calculations
 * between server processes (UTC or local) and mobile/web clients.
 */

/**
 * Returns a UTC Date object representing 00:00:00.000 for the current date in IST.
 * Formatted specifically for Prisma @db.Date column comparison.
 */
export function getTodayISTDate(d: Date = new Date()): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(d); // "YYYY-MM-DD"
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Returns hour (0-23), minute (0-59), and total minutes past midnight in IST (Asia/Kolkata).
 */
export function getISTTimeParts(d: Date = new Date()): { hour: number; minute: number; totalMinutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10) % 24;
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

/**
 * Returns start and end UTC Date objects for a given month and year.
 */
export function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Returns YYYY-MM-DD date string in IST.
 */
export function getISTDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
