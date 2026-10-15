import type { ListResponse, Note } from '@app/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notes } from '../src/db/schema';
import { bearer, createTestApp, expectError, expectValidationError, registerUser } from './helpers';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface TestUser {
  id: string;
  token: string;
}

let app: FastifyInstance;
let lena: TestUser;
let sam: TestUser;

beforeAll(async () => {
  app = await createTestApp();
  lena = await newUser('lena');
  sam = await newUser('sam');
});
afterAll(async () => {
  await app.close();
});

async function newUser(name: string): Promise<TestUser> {
  const { token, user } = await registerUser(app, { name });
  return { id: user.id, token };
}

function create(user: TestUser, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/notes', headers: bearer(user.token), payload: payload as object });
}

async function createNote(user: TestUser, payload: Record<string, unknown> = {}): Promise<Note> {
  const response = await create(user, { title: 'A note', ...payload });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Note>();
}

function getOne(user: TestUser, id: string) {
  return app.inject({ method: 'GET', url: `/api/v1/notes/${id}`, headers: bearer(user.token) });
}

function patch(user: TestUser, id: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/notes/${id}`,
    headers: bearer(user.token),
    payload: payload as object,
  });
}

function remove(user: TestUser, id: string) {
  return app.inject({ method: 'DELETE', url: `/api/v1/notes/${id}`, headers: bearer(user.token) });
}

function list(user: TestUser, query = '') {
  return app.inject({ method: 'GET', url: `/api/v1/notes${query}`, headers: bearer(user.token) });
}

async function listItems(user: TestUser, query = ''): Promise<ListResponse<Note>> {
  const response = await list(user, query);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ListResponse<Note>>();
}

describe('POST /api/v1/notes', () => {
  it('creates a note owned by the caller and returns 201 with the full shape', async () => {
    const response = await create(lena, {
      title: '  Weekly sync  ',
      body: 'Agenda\n- item',
      tags: ['Work', 'meetings'],
      ownerId: sam.id,
      id: UNKNOWN_ID,
      createdAt: '2020-01-01T00:00:00Z',
    });
    expect(response.statusCode, response.body).toBe(201);
    const note = response.json<Note>();
    expect(note.id).toMatch(UUID);
    expect(note.id).not.toBe(UNKNOWN_ID);
    expect(note.ownerId).toBe(lena.id);
    expect(note.title).toBe('Weekly sync');
    expect(note.body).toBe('Agenda\n- item');
    expect(note.tags).toEqual(['meetings', 'work']);
    expect(note.createdAt).toMatch(ISO_INSTANT);
    expect(note.updatedAt).toBe(note.createdAt);

    const fetched = await getOne(lena, note.id);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(note);
  });

  it('defaults body to "" and tags to []', async () => {
    const note = await createNote(lena, { title: 'Minimal' });
    expect(note.body).toBe('');
    expect(note.tags).toEqual([]);
  });

  describe('title', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['null', null],
      ['a number', 5],
      ['121 characters', 'a'.repeat(121)],
      ['121 code points', '\u{1F600}'.repeat(121)],
      ['containing NUL', 'a\u0000'],
    ])('rejects a title that is %s with 400 at title', async (_label, title) => {
      expectValidationError(await create(lena, { title }), 'title');
    });

    it('accepts 120 characters, with or without surrounding spaces, and stores them trimmed', async () => {
      const title = 'a'.repeat(120);
      expect((await createNote(lena, { title })).title).toBe(title);
      expect((await createNote(lena, { title: `  ${title}  ` })).title).toBe(title);
      expect((await createNote(lena, { title: '\u{1F600}'.repeat(120) })).title).toBe('\u{1F600}'.repeat(120));
    });
  });

  describe('body', () => {
    it('is stored verbatim, without trimming', async () => {
      expect((await createNote(lena, { body: '  x\n ' })).body).toBe('  x\n ');
    });

    it('accepts 20000 characters and rejects 20001', async () => {
      expect((await createNote(lena, { body: 'b'.repeat(20_000) })).body).toHaveLength(20_000);
      expectValidationError(await create(lena, { title: 't', body: 'b'.repeat(20_001) }), 'body');
    });

    it.each([
      ['null', null],
      ['a number', 5],
      ['containing NUL', 'x\u0000y'],
      ['a lone surrogate', '\uD800'],
    ])('rejects a body that is %s with 400 at body', async (_label, body) => {
      expectValidationError(await create(lena, { title: 't', body }), 'body');
    });

    it('accepts a paired emoji', async () => {
      expect((await createNote(lena, { body: 'hi \u{1F600}' })).body).toBe('hi \u{1F600}');
    });
  });

  describe('tags', () => {
    it('normalises, de-duplicates and sorts', async () => {
      expect((await createNote(lena, { tags: ['b', 'A', 'a-1', '0'] })).tags).toEqual(['0', 'a', 'a-1', 'b']);
      expect((await createNote(lena, { tags: [' Work ', 'work', 'WORK'] })).tags).toEqual(['work']);
    });

    it('reports an invalid tag at its index in the request', async () => {
      expectValidationError(await create(lena, { title: 't', tags: ['ok', 'Bad Tag'] }), 'tags.1');
    });

    it.each([
      ['empty', ''],
      ['blank', '  '],
      ['31 characters', 'a'.repeat(31)],
      ['with an underscore', 'a_b'],
      ['non-ASCII', 'é'],
      ['a number', 5],
    ])('rejects a tag that is %s at tags.<index>', async (_label, tag) => {
      expectValidationError(await create(lena, { title: 't', tags: ['ok', 'fine', tag] }), 'tags.2');
    });

    it.each([
      ['null', null],
      ['a string', 'a'],
    ])('rejects tags that are %s at tags', async (_label, tags) => {
      expectValidationError(await create(lena, { title: 't', tags }), 'tags');
    });

    it('allows at most 10 distinct tags', async () => {
      const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
      expectValidationError(await create(lena, { title: 't', tags: eleven }), 'tags');
      const collapsing = [...eleven.slice(0, 10), 'T0', ' t1 '];
      expect((await createNote(lena, { tags: collapsing })).tags).toHaveLength(10);
    });
  });
});

describe('GET /api/v1/notes/:noteId', () => {
  it('returns 404 for another user\'s note, a malformed id and an unknown id', async () => {
    const note = await createNote(lena);
    expectError(await getOne(sam, note.id), 404, 'NOT_FOUND');
    expectError(await getOne(lena, 'not-a-uuid'), 404, 'NOT_FOUND');
    expectError(await getOne(lena, UNKNOWN_ID), 404, 'NOT_FOUND');
  });
});

describe('PATCH /api/v1/notes/:noteId', () => {
  it('changes only the fields present and moves updatedAt strictly forward', async () => {
    const note = await createNote(lena, { title: 'Old', body: 'keep', tags: ['x'] });
    const response = await patch(lena, note.id, { title: '  New  ' });
    expect(response.statusCode, response.body).toBe(200);
    const updated = response.json<Note>();
    expect(updated).toMatchObject({ id: note.id, ownerId: lena.id, title: 'New', body: 'keep', tags: ['x'] });
    expect(updated.createdAt).toBe(note.createdAt);
    expect(updated.updatedAt > note.updatedAt).toBe(true);
    expect((await getOne(lena, note.id)).json()).toEqual(updated);
  });

  it('answers {} with 200 and leaves updatedAt unchanged', async () => {
    const note = await createNote(lena, { tags: ['a'] });
    const response = await patch(lena, note.id, {});
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(note);
  });

  it('leaves updatedAt unchanged when the normalised values are the same', async () => {
    const note = await createNote(lena, { title: 'Same', body: ' b ', tags: ['a', 'b'] });
    const response = await patch(lena, note.id, { title: '  Same ', body: ' b ', tags: ['B', 'a', 'a'] });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(note);
  });

  it('clears the body with "" and the tags with []', async () => {
    const note = await createNote(lena, { body: 'text', tags: ['a'] });
    const response = await patch(lena, note.id, { body: '', tags: [] });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<Note>()).toMatchObject({ body: '', tags: [] });
  });

  it('replaces the whole tag list, normalised', async () => {
    const note = await createNote(lena, { tags: ['a', 'b'] });
    const response = await patch(lena, note.id, { tags: ['Z', 'c'] });
    expect(response.json<Note>().tags).toEqual(['c', 'z']);
  });

  it.each([
    ['title', null],
    ['title', ''],
    ['body', null],
    ['tags', null],
  ])('rejects %s = %j with 400', async (field, value) => {
    const note = await createNote(lena);
    expectValidationError(await patch(lena, note.id, { [field]: value }), field);
  });

  it('reports a bad tag at tags.<index>', async () => {
    const note = await createNote(lena);
    expectValidationError(await patch(lena, note.id, { tags: ['ok', 'no way'] }), 'tags.1');
  });

  it('returns 404 for another user\'s note, a malformed id and an unknown id, also for {}', async () => {
    const note = await createNote(lena, { title: 'Private' });
    expectError(await patch(sam, note.id, { title: 'Hijack' }), 404, 'NOT_FOUND');
    expectError(await patch(sam, note.id, {}), 404, 'NOT_FOUND');
    expectError(await patch(lena, 'not-a-uuid', { title: 'x' }), 404, 'NOT_FOUND');
    expectError(await patch(lena, UNKNOWN_ID, {}), 404, 'NOT_FOUND');
    expect((await getOne(lena, note.id)).json<Note>().title).toBe('Private');
  });

  it('validates the body before checking visibility', async () => {
    expectValidationError(await patch(lena, UNKNOWN_ID, { title: '' }), 'title');
  });

  it.each([
    ['title', { title: 'Changed' }],
    ['body, compared verbatim', { body: ' x' }],
    ['tags', { tags: ['y'] }],
  ])('moves updatedAt forward when only the %s changes', async (_label, change) => {
    const note = await createNote(lena, { title: 'Original', body: 'x', tags: ['x'] });
    const response = await patch(lena, note.id, change);
    expect(response.statusCode, response.body).toBe(200);
    const updated = response.json<Note>();
    expect(updated).toMatchObject(change);
    expect(updated.updatedAt > note.updatedAt).toBe(true);
    expect(updated.createdAt).toBe(note.createdAt);
  });

  it('ignores ownerId, id and createdAt in the body, so a note cannot be handed to another user', async () => {
    const note = await createNote(lena, { title: 'Mine' });
    const response = await patch(lena, note.id, { ownerId: sam.id, id: UNKNOWN_ID, createdAt: '2020-01-01T00:00:00Z' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(note);
    expectError(await getOne(sam, note.id), 404, 'NOT_FOUND');
    expect((await listItems(sam, '?limit=100')).items.map((item) => item.id)).not.toContain(note.id);
    expect((await getOne(lena, note.id)).json()).toEqual(note);
  });

  it('applies nothing when any field is invalid', async () => {
    const note = await createNote(lena, { title: 'Untouched', body: 'b', tags: ['a'] });
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expectValidationError(await patch(lena, note.id, { title: 'New', body: 'new', tags: eleven }), 'tags');
    expectValidationError(await patch(lena, note.id, { title: 'New', tags: ['ok', 'bad tag'] }), 'tags.1');
    expect((await getOne(lena, note.id)).json()).toEqual(note);
  });

  it('keeps both edits when two requests change different fields at the same time', async () => {
    const note = await createNote(lena, { title: 'Race', body: 'b', tags: ['a'] });
    const [titleEdit, tagsEdit] = await Promise.all([
      patch(lena, note.id, { title: 'Race, renamed' }),
      patch(lena, note.id, { tags: ['b', 'c'] }),
    ]);
    expect(titleEdit.statusCode, titleEdit.body).toBe(200);
    expect(tagsEdit.statusCode, tagsEdit.body).toBe(200);
    expect((await getOne(lena, note.id)).json<Note>()).toMatchObject({
      title: 'Race, renamed',
      body: 'b',
      tags: ['b', 'c'],
    });
  });

  it('writes once when the same edit arrives twice at the same time', async () => {
    const note = await createNote(lena, { title: 'Before' });
    const responses = await Promise.all([
      patch(lena, note.id, { title: 'After' }),
      patch(lena, note.id, { title: 'After' }),
    ]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    const [first, second] = responses.map((response) => response.json<Note>());
    // The second request sees the first one's value, so it changes nothing and keeps its updatedAt.
    expect(first?.updatedAt).toBe(second?.updatedAt);
    expect((await getOne(lena, note.id)).json<Note>().updatedAt).toBe(first?.updatedAt);
  });
});

describe('DELETE /api/v1/notes/:noteId', () => {
  it('returns 204 with an empty body, after which the note is gone', async () => {
    const note = await createNote(lena);
    const response = await remove(lena, note.id);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expectError(await getOne(lena, note.id), 404, 'NOT_FOUND');
    expectError(await patch(lena, note.id, { title: 'x' }), 404, 'NOT_FOUND');
    expectError(await remove(lena, note.id), 404, 'NOT_FOUND');
    const { items } = await listItems(lena, '?limit=100');
    expect(items.map((item) => item.id)).not.toContain(note.id);
  });

  it('returns 404 for another user\'s note, a malformed id and an unknown id', async () => {
    const note = await createNote(lena);
    expectError(await remove(sam, note.id), 404, 'NOT_FOUND');
    expectError(await remove(lena, 'not-a-uuid'), 404, 'NOT_FOUND');
    expectError(await remove(lena, UNKNOWN_ID), 404, 'NOT_FOUND');
    expect((await getOne(lena, note.id)).statusCode).toBe(200);
  });

  it('deletes only the given note', async () => {
    const user = await newUser('delete-one');
    const keep = await createNote(user, { title: 'Keep' });
    const gone = await createNote(user, { title: 'Gone' });
    expect((await remove(user, gone.id)).statusCode).toBe(204);
    expect(await listItems(user)).toMatchObject({ total: 1, items: [keep] });
  });

  it('answers 204 to exactly one of two simultaneous deletes and 404 to the other', async () => {
    const note = await createNote(lena);
    const statuses = (await Promise.all([remove(lena, note.id), remove(lena, note.id)])).map((r) => r.statusCode);
    expect(statuses.sort()).toEqual([204, 404]);
  });
});

describe('GET /api/v1/notes', () => {
  it('lists only the caller\'s notes, with a matching total', async () => {
    const kim = await newUser('kim');
    const ivo = await newUser('ivo');
    const kimNotes = [await createNote(kim, { title: 'K1' }), await createNote(kim, { title: 'K2' })];
    await createNote(ivo, { title: 'I1' });

    const kimList = await listItems(kim);
    expect(kimList.total).toBe(2);
    expect(kimList.items.map((note) => note.id).sort()).toEqual(kimNotes.map((note) => note.id).sort());
    expect(kimList.items.every((note) => note.ownerId === kim.id)).toBe(true);
    expect(kimList).toMatchObject({ limit: 20, offset: 0 });

    const ivoList = await listItems(ivo);
    expect(ivoList.total).toBe(1);
    expect(ivoList.items[0]?.title).toBe('I1');

    const fresh = await newUser('fresh');
    expect(await listItems(fresh)).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('sorts by updatedAt descending, and an edited note moves to the top', async () => {
    const user = await newUser('order');
    // Distinct instants set directly: notes created back to back can share a millisecond (then id decides).
    const [first, second, third] = await app.db
      .insert(notes)
      .values(
        ['2025-01-01', '2025-01-02', '2025-01-03'].map((day, i) => ({
          ownerId: user.id,
          title: `note ${String(i)}`,
          updatedAt: new Date(`${day}T00:00:00.000Z`),
        })),
      )
      .returning();
    if (first === undefined || second === undefined || third === undefined) throw new Error('insert failed');

    const before = await listItems(user);
    expect(before.items.map((note) => note.id)).toEqual([third.id, second.id, first.id]);

    expect((await patch(user, first.id, { title: 'first, edited' })).statusCode).toBe(200);
    const after = await listItems(user);
    expect(after.items.map((note) => note.id)).toEqual([first.id, third.id, second.id]);
  });

  it('breaks updatedAt ties by id ascending', async () => {
    const user = await newUser('ties');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const inserted = await app.db
      .insert(notes)
      .values([
        { ownerId: user.id, title: 'tie 1', updatedAt },
        { ownerId: user.id, title: 'tie 2', updatedAt },
        { ownerId: user.id, title: 'tie 3', updatedAt },
      ])
      .returning();
    const newer = await createNote(user, { title: 'newer' });

    const { items } = await listItems(user);
    const expectedTies = inserted.map((row) => row.id).sort();
    expect(items.map((note) => note.id)).toEqual([newer.id, ...expectedTies]);
    expect(items[1]?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('pages with limit and offset, and an offset past the end keeps the total', async () => {
    const user = await newUser('paging');
    for (let i = 0; i < 3; i += 1) await createNote(user, { title: `n${i}` });

    const page = await listItems(user, '?limit=2&offset=1');
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(page.items).toHaveLength(2);

    expect(await listItems(user, '?offset=10')).toEqual({ items: [], total: 3, limit: 20, offset: 10 });
    expect(await listItems(user, '?limit=&offset=')).toMatchObject({ total: 3, limit: 20, offset: 0 });
  });

  it.each(['?limit=0', '?limit=101', '?offset=-1', '?limit=abc'])(
    'answers 400 for %s at the parameter name',
    async (query) => {
      const path = query.slice(1).split('=')[0] ?? '';
      expectValidationError(await list(lena, query), path);
    },
  );
});

describe('authentication', () => {
  it.each([
    ['POST', '/api/v1/notes'],
    ['GET', '/api/v1/notes'],
    ['GET', `/api/v1/notes/${UNKNOWN_ID}`],
    ['PATCH', `/api/v1/notes/${UNKNOWN_ID}`],
    ['DELETE', `/api/v1/notes/${UNKNOWN_ID}`],
  ] as const)('%s %s requires a token', async (method, url) => {
    const response = await app.inject({ method, url, payload: method === 'POST' || method === 'PATCH' ? {} : undefined });
    expectError(response, 401, 'UNAUTHENTICATED');
  });
});
