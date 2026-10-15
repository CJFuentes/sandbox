import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { createNoteBodySchema, isStorableText, updateNoteBodySchema } from '../src/notes';
import { zodIssuesToDetails } from '../src/schemas';

function errorPaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : zodIssuesToDetails(result.error).map((detail) => detail.path);
}

function parseCreate(input: unknown) {
  return createNoteBodySchema.parse(input);
}

describe('isStorableText', () => {
  it('rejects NUL and unpaired surrogates, accepts paired ones', () => {
    expect(isStorableText('plain text\n')).toBe(true);
    expect(isStorableText('emoji \u{1F600}')).toBe(true);
    expect(isStorableText('a\u0000b')).toBe(false);
    expect(isStorableText('\uD800')).toBe(false);
    expect(isStorableText('x\uDC00')).toBe(false);
  });
});

describe('note title', () => {
  it('is trimmed, then 1-120 characters', () => {
    expect(parseCreate({ title: '  Hello  ' }).title).toBe('Hello');
    expect(parseCreate({ title: ` ${'a'.repeat(120)} ` }).title).toBe('a'.repeat(120));
    expect(errorPaths(createNoteBodySchema, { title: 'a'.repeat(121) })).toEqual(['title']);
  });

  it('counts code points', () => {
    expect(parseCreate({ title: '\u{1F600}'.repeat(120) }).title).toBe('\u{1F600}'.repeat(120));
    expect(errorPaths(createNoteBodySchema, { title: '\u{1F600}'.repeat(121) })).toEqual(['title']);
  });

  it('is required and must be a non-empty string', () => {
    for (const title of [undefined, '', '   ', null, 5]) {
      expect(errorPaths(createNoteBodySchema, { title })).toEqual(['title']);
    }
  });

  it('rejects NUL', () => {
    expect(errorPaths(createNoteBodySchema, { title: 'a\u0000' })).toEqual(['title']);
  });
});

describe('note body', () => {
  it('defaults to "" and is stored verbatim', () => {
    expect(parseCreate({ title: 't' }).body).toBe('');
    expect(parseCreate({ title: 't', body: '  x\n ' }).body).toBe('  x\n ');
  });

  it('allows up to 20000 characters', () => {
    expect(parseCreate({ title: 't', body: 'b'.repeat(20_000) }).body).toHaveLength(20_000);
    expect(errorPaths(createNoteBodySchema, { title: 't', body: 'b'.repeat(20_001) })).toEqual(['body']);
  });

  it('rejects null and non-strings', () => {
    expect(errorPaths(createNoteBodySchema, { title: 't', body: null })).toEqual(['body']);
    expect(errorPaths(createNoteBodySchema, { title: 't', body: 5 })).toEqual(['body']);
  });

  it('rejects NUL and lone surrogates, accepts paired emoji', () => {
    expect(errorPaths(createNoteBodySchema, { title: 't', body: 'x\u0000y' })).toEqual(['body']);
    expect(errorPaths(createNoteBodySchema, { title: 't', body: '\uD800' })).toEqual(['body']);
    expect(parseCreate({ title: 't', body: 'hi \u{1F600}' }).body).toBe('hi \u{1F600}');
  });
});

describe('note tags', () => {
  it('defaults to []', () => {
    expect(parseCreate({ title: 't' }).tags).toEqual([]);
  });

  it('normalises, de-duplicates and sorts', () => {
    expect(parseCreate({ title: 't', tags: [' Work ', 'work', 'IDEAS'] }).tags).toEqual(['ideas', 'work']);
    expect(parseCreate({ title: 't', tags: ['b', 'A', 'a-1', '0'] }).tags).toEqual(['0', 'a', 'a-1', 'b']);
  });

  it('reports an invalid element at tags.<index>', () => {
    expect(errorPaths(createNoteBodySchema, { title: 't', tags: ['ok', 'Bad Tag'] })).toEqual(['tags.1']);
    for (const bad of ['', '  ', 'a'.repeat(31), 'a_b', 'é', 5]) {
      expect(errorPaths(createNoteBodySchema, { title: 't', tags: ['ok', 'fine', bad] })).toEqual(['tags.2']);
    }
    expect(parseCreate({ title: 't', tags: ['a'.repeat(30)] }).tags).toEqual(['a'.repeat(30)]);
  });

  it('rejects a non-array at tags', () => {
    expect(errorPaths(createNoteBodySchema, { title: 't', tags: null })).toEqual(['tags']);
    expect(errorPaths(createNoteBodySchema, { title: 't', tags: 'a' })).toEqual(['tags']);
  });

  it('allows at most 10 distinct tags', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(errorPaths(createNoteBodySchema, { title: 't', tags: eleven })).toEqual(['tags']);
    const twelveCollapsingToTen = [...eleven.slice(0, 10), 'T0', ' t1 '];
    expect(parseCreate({ title: 't', tags: twelveCollapsingToTen }).tags).toHaveLength(10);
  });
});

describe('updateNoteBodySchema', () => {
  it('accepts {} and leaves absent fields undefined', () => {
    expect(updateNoteBodySchema.parse({})).toEqual({});
  });

  it('normalises present fields', () => {
    expect(updateNoteBodySchema.parse({ title: ' T ', body: ' b ', tags: ['B', 'a'] })).toEqual({
      title: 'T',
      body: ' b ',
      tags: ['a', 'b'],
    });
    expect(updateNoteBodySchema.parse({ body: '', tags: [] })).toEqual({ body: '', tags: [] });
  });

  it('rejects null for every field', () => {
    for (const field of ['title', 'body', 'tags']) {
      expect(errorPaths(updateNoteBodySchema, { [field]: null })).toEqual([field]);
    }
  });
});
