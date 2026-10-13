import { describe, expect, it } from 'vitest';
import {
  countChars,
  isUuid,
  isValidDate,
  isValidEmail,
  isValidTimeOfDay,
  isValidTimeZone,
  normalizeEmail,
  parseInstant,
} from '../src/formats';

describe('parseInstant', () => {
  it('accepts Z, offsets and fractional seconds', () => {
    expect(parseInstant('2026-11-02T09:00:00Z')?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(parseInstant('2026-11-02T18:00:00+09:00')?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(parseInstant('2026-11-02T08:30:00-00:30')?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(parseInstant('2026-11-02T09:00:00.5Z')?.toISOString()).toBe('2026-11-02T09:00:00.500Z');
    expect(parseInstant('2026-11-02T09:00:00.123456Z')?.toISOString()).toBe('2026-11-02T09:00:00.123Z');
  });

  it('rejects a missing offset, impossible values and other formats', () => {
    for (const value of [
      '2026-11-02T09:00:00',
      '2026-11-02 09:00:00Z',
      '2026-11-02T09:00Z',
      '2026-02-30T09:00:00Z',
      '2026-11-02T24:00:00Z',
      '2026-11-02T09:60:00Z',
      '2026-11-02T09:00:00+24:00',
      '2026-11-02',
      '1730538000000',
      '',
    ]) {
      expect(parseInstant(value), value).toBeNull();
    }
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDate('2026-11-02')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
  });
});

describe('isValidTimeOfDay', () => {
  it('accepts zero-padded 24-hour HH:mm', () => {
    expect(isValidTimeOfDay('00:00')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('9:00')).toBe(false);
    expect(isValidTimeOfDay('24:00')).toBe(false);
    expect(isValidTimeOfDay('24:00', { allow24: true })).toBe(true);
    expect(isValidTimeOfDay('24:01', { allow24: true })).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects unknown ones', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('emails, ids and lengths', () => {
  it('normalises and validates emails', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(isValidEmail('ada@example.com')).toBe(true);
    expect(isValidEmail('ada@example')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });

  it('recognises UUIDs', () => {
    expect(isUuid('6f1c1f0e-8d1b-4c39-9a57-2b1a5c0f9e11')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('6f1c1f0e8d1b4c399a572b1a5c0f9e11')).toBe(false);
  });

  it('counts code points', () => {
    expect(countChars('abc')).toBe(3);
    expect(countChars('😀')).toBe(1);
  });
});
