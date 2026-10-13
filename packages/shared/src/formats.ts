// Data-format rules from docs/contract.md §1.3, as plain predicates and parsers.

/** Email shape (§1.3), checked after trimming and lower-casing. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/;

/** Number of characters (Unicode code points), as the contract's length limits count them. */
export function countChars(value: string): number {
  return Array.from(value).length;
}

/** Trims and lower-cases an email, the form in which emails are stored and compared. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(normalized: string): boolean {
  return normalized.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(normalized);
}

/**
 * True for a well-formed UUID. Ids are opaque to clients: a malformed id must behave exactly like an
 * unknown one (404 in a path or body, "matches nothing" as a query filter), so check with this before
 * passing an id to a `uuid` column.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isRealDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `YYYY-MM-DD` and a real calendar date. */
export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** `HH:mm`, 24-hour, zero-padded. `24:00` only when `allow24` is set. */
export function isValidTimeOfDay(value: string, options: { allow24?: boolean } = {}): boolean {
  if (value === '24:00') return options.allow24 === true;
  return TIME_PATTERN.test(value);
}

/** A trimmed IANA time-zone name that `Intl.DateTimeFormat` accepts. */
export function isValidTimeZone(value: string): boolean {
  if (value.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses an RFC 3339 date-time with `Z` or a numeric offset and optional fractional seconds
 * (e.g. `2026-11-02T09:00:00Z`, `2026-11-02T18:00:00.5+09:00`). Returns `null` for anything else,
 * including a missing offset or an impossible date or time.
 */
export function parseInstant(value: string): Date | null {
  const match = INSTANT_PATTERN.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zulu, sign, offH, offM] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (zulu === undefined) {
    const offsetHours = Number(offH);
    const offsetMins = Number(offM);
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMins);
  }
  const millis = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'));

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millis);
  return new Date(date.getTime() - offsetMinutes * 60_000);
}
