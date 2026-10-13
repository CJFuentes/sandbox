import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  entityId,
  instant,
  integer,
  optionalText,
  queryBool,
  queryInt,
  registerBodySchema,
  requiredString,
  zodIssuesToDetails,
} from '../src/schemas';

describe('requiredString', () => {
  it('trims before checking the length', () => {
    const schema = requiredString(3);
    expect(schema.parse('  abc  ')).toBe('abc');
    expect(schema.safeParse('   ').success).toBe(false);
    expect(schema.safeParse('abcd').success).toBe(false);
  });

  it('rejects null and non-strings', () => {
    const schema = requiredString(10);
    expect(schema.safeParse(null).success).toBe(false);
    expect(schema.safeParse(5).success).toBe(false);
  });
});

describe('optionalText', () => {
  it('stores empty text as null and keeps absence', () => {
    const schema = z.object({ notes: optionalText(5) });
    expect(schema.parse({ notes: '  ' })).toEqual({ notes: null });
    expect(schema.parse({ notes: ' hi ' })).toEqual({ notes: 'hi' });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ notes: null }).success).toBe(false);
  });
});

describe('entityId', () => {
  it('trims, treats an empty id as missing and leaves malformed ids to the 404 check', () => {
    const schema = z.object({ itemId: entityId() });
    expect(schema.parse({ itemId: ' not-a-uuid ' })).toEqual({ itemId: 'not-a-uuid' });
    for (const itemId of ['', '   ', null, 42, undefined]) {
      const result = schema.safeParse({ itemId });
      expect(result.success).toBe(false);
      if (!result.success) expect(zodIssuesToDetails(result.error)[0]?.path).toBe('itemId');
    }
  });
});

describe('integer', () => {
  it('accepts JSON integers only', () => {
    const schema = integer(1, 10);
    expect(schema.parse(3)).toBe(3);
    expect(schema.safeParse(1.5).success).toBe(false);
    expect(schema.safeParse('3').success).toBe(false);
    expect(schema.safeParse(11).success).toBe(false);
  });
});

describe('instant', () => {
  it('parses to a Date and reports bad input', () => {
    expect(instant().parse('2026-11-02T18:00:00+09:00').toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(instant().safeParse('2026-11-02T09:00:00').success).toBe(false);
  });
});

describe('query helpers', () => {
  it('parses decimal integers within range', () => {
    const schema = queryInt({ min: 1, max: 100 });
    expect(schema.parse('20')).toBe(20);
    expect(schema.safeParse('0').success).toBe(false);
    expect(schema.safeParse('101').success).toBe(false);
    expect(schema.safeParse('1.5').success).toBe(false);
    expect(schema.safeParse('-1').success).toBe(false);
    expect(schema.safeParse('abc').success).toBe(false);
  });

  it('parses exact booleans', () => {
    expect(queryBool().parse('true')).toBe(true);
    expect(queryBool().parse('false')).toBe(false);
    expect(queryBool().safeParse('1').success).toBe(false);
  });
});

describe('registerBodySchema', () => {
  it('normalises the email and trims the name, but not the password', () => {
    expect(
      registerBodySchema.parse({ email: ' Ada@Example.com ', password: ' secret12 ', name: ' Ada ', extra: 1 }),
    ).toEqual({ email: 'ada@example.com', password: ' secret12 ', name: 'Ada' });
  });

  it('reports every invalid property by its path', () => {
    const result = registerBodySchema.safeParse({ email: 'nope', password: 'short', name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodIssuesToDetails(result.error).map((detail) => detail.path).sort()).toEqual([
        'email',
        'name',
        'password',
      ]);
    }
  });

  it('uses an empty path for a body that is not an object', () => {
    const result = registerBodySchema.safeParse([]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodIssuesToDetails(result.error)[0]?.path).toBe('');
    }
  });
});
