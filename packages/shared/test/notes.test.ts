import { describe, expect, it } from 'vitest';
import {
  NOTE_BODY_MAX,
  createNoteBodySchema,
  hasStorableChars,
  updateNoteBodySchema,
} from '../src/notes';
import { zodIssuesToDetails } from '../src/schemas';

function issuePaths(schema: typeof createNoteBodySchema | typeof updateNoteBodySchema, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return zodIssuesToDetails(result.error).map((detail) => detail.path);
}

describe('createNoteBodySchema', () => {
  it('trims the title, keeps the body verbatim and normalises, de-duplicates and sorts the tags', () => {
    expect(
      createNoteBodySchema.parse({
        title: '  Standup ',
        body: '  hi\n',
        tags: ['Planning', ' budget', 'planning'],
      }),
    ).toEqual({ title: 'Standup', body: '  hi\n', tags: ['budget', 'planning'] });
  });

  it('defaults the body to "" and the tags to []', () => {
    expect(createNoteBodySchema.parse({ title: 'x' })).toEqual({ title: 'x', body: '', tags: [] });
  });

  it('keeps a body with CRLF, leading spaces and a final line break exactly', () => {
    expect(createNoteBodySchema.parse({ title: 'x', body: '  a\r\nb\n' }).body).toBe('  a\r\nb\n');
  });

  it('reports an empty or missing title at "title" with a single issue', () => {
    expect(issuePaths(createNoteBodySchema, { title: '' })).toEqual(['title']);
    expect(issuePaths(createNoteBodySchema, { title: '   ' })).toEqual(['title']);
    expect(issuePaths(createNoteBodySchema, {})).toEqual(['title']);
  });

  it('accepts a 120-character title and rejects 121', () => {
    expect(createNoteBodySchema.safeParse({ title: 'a'.repeat(120) }).success).toBe(true);
    expect(issuePaths(createNoteBodySchema, { title: 'a'.repeat(121) })).toEqual(['title']);
  });

  it('reports an invalid tag at its index in the request', () => {
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: ['ok', 'road map'] })).toEqual(['tags.1']);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: [5, 'x y'] })).toEqual(['tags.0', 'tags.1']);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: ['a'.repeat(31)] })).toEqual(['tags.0']);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: ['  '] })).toEqual(['tags.0']);
  });

  it('rejects more than 10 distinct tags at "tags"', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: eleven })).toEqual(['tags']);
  });

  it('accepts 10 distinct tags plus a case duplicate', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    const result = createNoteBodySchema.parse({ title: 'Ideas', tags: [...ten, 'TAG-0'] });
    expect(result.tags).toHaveLength(10);
  });

  it('rejects null body and null tags', () => {
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', body: null })).toEqual(['body']);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: null })).toEqual(['tags']);
    expect(issuePaths(createNoteBodySchema, { title: 'Ideas', tags: 'a,b' })).toEqual(['tags']);
  });

  it('accepts a body of 20000 characters and rejects 20001', () => {
    expect(createNoteBodySchema.safeParse({ title: 'x', body: 'a'.repeat(NOTE_BODY_MAX) }).success).toBe(true);
    expect(issuePaths(createNoteBodySchema, { title: 'x', body: 'a'.repeat(NOTE_BODY_MAX + 1) })).toEqual(['body']);
  });

  it('rejects NUL characters and unpaired surrogates in the title and body', () => {
    expect(issuePaths(createNoteBodySchema, { title: 'a\u0000b' })).toEqual(['title']);
    expect(issuePaths(createNoteBodySchema, { title: 'x', body: 'l\u0000' })).toEqual(['body']);
    expect(issuePaths(createNoteBodySchema, { title: 'x', body: '\ud800' })).toEqual(['body']);
    expect(issuePaths(createNoteBodySchema, { title: 'a\udc00' })).toEqual(['title']);
  });

  it('accepts paired surrogates (emoji) verbatim', () => {
    expect(createNoteBodySchema.parse({ title: 'x😀', body: '  ok😀\r\n' })).toEqual({
      title: 'x😀',
      body: '  ok😀\r\n',
      tags: [],
    });
  });

  it('ignores unknown properties such as ownerId', () => {
    expect(createNoteBodySchema.parse({ title: 'x', ownerId: 'someone' })).toEqual({ title: 'x', body: '', tags: [] });
  });
});

describe('updateNoteBodySchema', () => {
  it('parses {} to {}', () => {
    expect(updateNoteBodySchema.parse({})).toEqual({});
  });

  it('normalises present fields only', () => {
    expect(updateNoteBodySchema.parse({ tags: [' PLANNING', 'budget', 'budget'] })).toEqual({
      tags: ['budget', 'planning'],
    });
  });

  it('rejects null and blank values', () => {
    expect(issuePaths(updateNoteBodySchema, { title: '  ' })).toEqual(['title']);
    expect(issuePaths(updateNoteBodySchema, { title: null })).toEqual(['title']);
    expect(issuePaths(updateNoteBodySchema, { body: null })).toEqual(['body']);
    expect(issuePaths(updateNoteBodySchema, { tags: null })).toEqual(['tags']);
  });

  it('accepts an empty tag list (clears the tags)', () => {
    expect(updateNoteBodySchema.parse({ tags: [] })).toEqual({ tags: [] });
  });
});

describe('hasStorableChars', () => {
  it('accepts ordinary text, whitespace and paired surrogates', () => {
    expect(hasStorableChars('')).toBe(true);
    expect(hasStorableChars('  hello\r\n\t')).toBe(true);
    expect(hasStorableChars('😀')).toBe(true);
  });

  it('rejects NUL and unpaired surrogates', () => {
    expect(hasStorableChars('a\u0000')).toBe(false);
    expect(hasStorableChars('\ud800')).toBe(false);
    expect(hasStorableChars('x\udfff')).toBe(false);
    expect(hasStorableChars('\ude00\ud83d')).toBe(false);
  });
});
