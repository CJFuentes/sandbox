import { describe, expect, it } from 'vitest';
import { canEditNote, createNoteBodySchema, updateNoteBodySchema } from '../src/notes';
import { zodIssuesToDetails } from '../src/schemas';

function errorPaths(result: ReturnType<typeof createNoteBodySchema.safeParse>): string[] {
  return result.success ? [] : zodIssuesToDetails(result.error).map((detail) => detail.path);
}

describe('createNoteBodySchema', () => {
  it('trims the title and enforces 1-120 characters', () => {
    expect(createNoteBodySchema.parse({ title: '  Standup  ' }).title).toBe('Standup');
    expect(createNoteBodySchema.safeParse({ title: 'a'.repeat(120) }).success).toBe(true);
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'a'.repeat(121) }))).toEqual(['title']);
    for (const title of ['', '   ', null, 42, undefined]) {
      expect(errorPaths(createNoteBodySchema.safeParse({ title }))).toEqual(['title']);
    }
  });

  it('keeps the body verbatim, defaults it to "" and rejects null', () => {
    expect(createNoteBodySchema.parse({ title: 'x', body: '  Hiring\n' }).body).toBe('  Hiring\n');
    expect(createNoteBodySchema.parse({ title: 'x' })).toEqual({ title: 'x', body: '', tags: [] });
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', body: null }))).toEqual(['body']);
    expect(createNoteBodySchema.safeParse({ title: 'x', body: 'b'.repeat(20_000) }).success).toBe(true);
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', body: 'b'.repeat(20_001) }))).toEqual(['body']);
  });

  it('counts body length in code points', () => {
    expect(createNoteBodySchema.safeParse({ title: 'x', body: '😀'.repeat(20_000) }).success).toBe(true);
  });

  it('rejects NUL characters in the title and body', () => {
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'a\u0000b' }))).toEqual(['title']);
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', body: 'a\u0000b' }))).toEqual(['body']);
  });

  it('normalises, de-duplicates and sorts tags', () => {
    const parsed = createNoteBodySchema.parse({ title: 'x', tags: ['Planning', ' budget ', 'planning'] });
    expect(parsed.tags).toEqual(['budget', 'planning']);
  });

  it('reports an invalid tag at its index in the request', () => {
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', tags: ['ok', 'road map'] }))).toEqual(['tags.1']);
    for (const tag of ['', '   ', 'a'.repeat(31), 7, null, 'a\u0000']) {
      expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', tags: ['ok', tag] }))).toEqual(['tags.1']);
    }
    expect(createNoteBodySchema.safeParse({ title: 'x', tags: ['a'.repeat(30)] }).success).toBe(true);
  });

  it('rejects more than 10 distinct tags at path "tags"', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `tag-${String(i)}`);
    expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', tags: eleven }))).toEqual(['tags']);
  });

  it('accepts 11 entries that collapse to 10 distinct tags', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag-${String(i)}`);
    const parsed = createNoteBodySchema.parse({ title: 'x', tags: [...ten, 'TAG-0'] });
    expect(parsed.tags).toHaveLength(10);
  });

  it('rejects a tags value that is not a list', () => {
    for (const tags of [null, 'a,b', { a: 1 }]) {
      expect(errorPaths(createNoteBodySchema.safeParse({ title: 'x', tags }))).toEqual(['tags']);
    }
  });

  it('drops unknown properties', () => {
    const parsed = createNoteBodySchema.parse({ title: 'x', ownerId: 'someone', id: 'abc' });
    expect(parsed).toEqual({ title: 'x', body: '', tags: [] });
  });
});

describe('updateNoteBodySchema', () => {
  it('keeps absent properties absent', () => {
    expect(updateNoteBodySchema.parse({})).toEqual({});
    expect(updateNoteBodySchema.parse({ tags: ['B', 'a'] })).toEqual({ tags: ['a', 'b'] });
    expect(updateNoteBodySchema.parse({ tags: [] })).toEqual({ tags: [] });
  });

  it('applies the same rules as create', () => {
    expect(updateNoteBodySchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(updateNoteBodySchema.safeParse({ body: null }).success).toBe(false);
    expect(updateNoteBodySchema.parse({ title: ' T ', body: ' b ' })).toEqual({ title: 'T', body: ' b ' });
  });
});

describe('canEditNote', () => {
  it('lets only the owner edit', () => {
    expect(canEditNote({ ownerId: 'a' }, 'a')).toBe(true);
    expect(canEditNote({ ownerId: 'a' }, 'b')).toBe(false);
  });
});
