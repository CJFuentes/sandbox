// Personal notes (issue #98): AC1-AC6 and NOTE-1 to NOTE-6 against a real database.
import type { ListResponse, Note } from '@app/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, expectError, expectValidationError, registerUser, uniqueEmail } from './helpers';

const ISO_INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Keeps ordering-sensitive writes out of the same millisecond, so the id tie-break never decides an order. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

async function signUp(prefix: string): Promise<{ token: string; userId: string }> {
  const { token, user } = await registerUser(app, { email: uniqueEmail(prefix) });
  return { token, userId: user.id };
}

function createNote(token: string, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/notes', headers: bearer(token), payload: payload as object });
}

async function createOk(token: string, payload: unknown): Promise<Note> {
  const response = await createNote(token, payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Note>();
}

function getNote(token: string, noteId: string) {
  return app.inject({ method: 'GET', url: `/api/v1/notes/${noteId}`, headers: bearer(token) });
}

function patchNote(token: string, noteId: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/notes/${noteId}`,
    headers: bearer(token),
    payload: payload as object,
  });
}

async function patchOk(token: string, noteId: string, payload: unknown): Promise<Note> {
  const response = await patchNote(token, noteId, payload);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<Note>();
}

function deleteNote(token: string, noteId: string) {
  return app.inject({ method: 'DELETE', url: `/api/v1/notes/${noteId}`, headers: bearer(token) });
}

function listNotes(token: string, query = '') {
  return app.inject({ method: 'GET', url: `/api/v1/notes${query}`, headers: bearer(token) });
}

async function listOk(token: string, query = ''): Promise<ListResponse<Note>> {
  const response = await listNotes(token, query);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ListResponse<Note>>();
}

async function listTitles(token: string): Promise<string[]> {
  return (await listOk(token)).items.map((note) => note.title);
}

describe('AC1: create a note with tags', () => {
  it('returns 201 with normalised, de-duplicated, sorted tags; GET and the list return the same note', async () => {
    const lena = await signUp('lena');
    const response = await createNote(lena.token, {
      title: 'Q3 planning',
      body: 'Hiring and budget',
      tags: ['Planning', ' budget', 'planning'],
    });
    expect(response.statusCode, response.body).toBe(201);
    const note = response.json<Note>();
    expect(note.id).toMatch(UUID);
    expect(note.ownerId).toBe(lena.userId);
    expect(note.title).toBe('Q3 planning');
    expect(note.body).toBe('Hiring and budget');
    expect(note.tags).toEqual(['budget', 'planning']);
    expect(note.createdAt).toMatch(ISO_INSTANT);
    expect(note.updatedAt).toMatch(ISO_INSTANT);
    expect(note.createdAt).toBe(note.updatedAt);

    const fetched = await getNote(lena.token, note.id);
    expect(fetched.statusCode, fetched.body).toBe(200);
    expect(fetched.json<Note>()).toEqual(note);

    const list = await listOk(lena.token);
    expect(list.items).toContainEqual(note);
  });

  it('ignores an ownerId in the body', async () => {
    const lena = await signUp('lena');
    const sam = await signUp('sam');
    const note = await createOk(lena.token, { title: 'Mine', ownerId: sam.userId });
    expect(note.ownerId).toBe(lena.userId);
  });

  it('defaults body to "" and tags to []', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'Bare' });
    expect(note.body).toBe('');
    expect(note.tags).toEqual([]);
  });
});

describe('AC2: notes are private to their owner', () => {
  it('answers 404 to anyone else for GET, PATCH and DELETE, and leaves the note out of their list', async () => {
    const lena = await signUp('lena');
    const sam = await signUp('sam');
    const note = await createOk(lena.token, { title: 'Q3 planning' });

    expectError(await getNote(sam.token, note.id), 404, 'NOT_FOUND');
    expectError(await patchNote(sam.token, note.id, { title: 'x' }), 404, 'NOT_FOUND');
    expectError(await deleteNote(sam.token, note.id), 404, 'NOT_FOUND');

    const samList = await listOk(sam.token);
    expect(samList.items.map((item) => item.id)).not.toContain(note.id);
    expect(samList.total).toBe(0);

    const after = await getNote(lena.token, note.id);
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json<Note>()).toEqual(note);
  });

  it('answers 404 for malformed and unknown ids', async () => {
    const lena = await signUp('lena');
    for (const id of ['not-a-uuid', UNKNOWN_ID]) {
      expectError(await getNote(lena.token, id), 404, 'NOT_FOUND');
      expectError(await patchNote(lena.token, id, { title: 'x' }), 404, 'NOT_FOUND');
      expectError(await deleteNote(lena.token, id), 404, 'NOT_FOUND');
    }
  });

  it('answers 401 without a token', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'Q3 planning' });
    expectError(await app.inject({ method: 'GET', url: '/api/v1/notes' }), 401, 'UNAUTHENTICATED');
    expectError(
      await app.inject({ method: 'POST', url: '/api/v1/notes', payload: { title: 'x' } }),
      401,
      'UNAUTHENTICATED',
    );
    expectError(await app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}` }), 401, 'UNAUTHENTICATED');
    expectError(
      await app.inject({ method: 'PATCH', url: `/api/v1/notes/${note.id}`, payload: { title: 'x' } }),
      401,
      'UNAUTHENTICATED',
    );
    expectError(await app.inject({ method: 'DELETE', url: `/api/v1/notes/${note.id}` }), 401, 'UNAUTHENTICATED');
  });
});

describe('AC3: most recently updated note comes first', () => {
  it('moves an edited note to the top and leaves updatedAt alone when nothing changes', async () => {
    const lena = await signUp('lena');
    const retro = await createOk(lena.token, { title: 'Retro notes' });
    await tick();
    const q3 = await createOk(lena.token, { title: 'Q3 planning', tags: ['budget', 'planning'] });
    expect(await listTitles(lena.token)).toEqual(['Q3 planning', 'Retro notes']);

    await tick();
    const renamed = await patchOk(lena.token, retro.id, { title: 'Retro notes (final)' });
    expect(renamed.title).toBe('Retro notes (final)');
    expect(Date.parse(renamed.updatedAt)).toBeGreaterThan(Date.parse(retro.updatedAt));
    expect(renamed.createdAt).toBe(retro.createdAt);
    expect(await listTitles(lena.token)).toEqual(['Retro notes (final)', 'Q3 planning']);

    await tick();
    for (const payload of [{ title: 'Q3 planning' }, {}, { tags: [' PLANNING', 'budget', 'budget'] }]) {
      const saved = await patchOk(lena.token, q3.id, payload);
      expect(saved).toEqual(q3);
      const stored = (await getNote(lena.token, q3.id)).json<Note>();
      expect(stored.updatedAt).toBe(q3.updatedAt);
      expect(await listTitles(lena.token)).toEqual(['Retro notes (final)', 'Q3 planning']);
    }

    // Positive control: a real change does move updatedAt.
    const retagged = await patchOk(lena.token, q3.id, { tags: ['ideas'] });
    expect(Date.parse(retagged.updatedAt)).toBeGreaterThan(Date.parse(q3.updatedAt));
  });

  it('compares the trimmed title and the verbatim body when deciding whether anything changed', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'Standup', body: 'x' });
    await tick();

    // Same values once the title is trimmed: no write.
    expect(await patchOk(lena.token, note.id, { title: '  Standup  ', body: 'x' })).toEqual(note);

    // Whitespace in the body is significant (never trimmed), so this is a real change.
    const changed = await patchOk(lena.token, note.id, { body: ' x\n' });
    expect(changed.body).toBe(' x\n');
    expect(changed.title).toBe('Standup');
    expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(note.updatedAt));
    expect((await getNote(lena.token, note.id)).json<Note>()).toEqual(changed);
  });

  it('serialises concurrent edits of one note: distinct, increasing updatedAt and the last commit is stored', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'v0' });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => patchOk(lena.token, note.id, { title: `v${i + 1}` })),
    );
    const stamps = results.map((result) => result.updatedAt);
    expect(new Set(stamps).size).toBe(results.length);
    for (const stamp of stamps) expect(Date.parse(stamp)).toBeGreaterThan(Date.parse(note.updatedAt));

    const latest = [...results].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    expect((await getNote(lena.token, note.id)).json<Note>()).toEqual(latest);
  });

  it('gives strictly increasing updatedAt to consecutive changes', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'v0' });
    const first = await patchOk(lena.token, note.id, { title: 'v1' });
    const second = await patchOk(lena.token, note.id, { title: 'v2' });
    expect(Date.parse(first.updatedAt)).toBeGreaterThan(Date.parse(note.updatedAt));
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
  });

  it('orders concurrently created notes by updatedAt desc, then id asc, on the returned values', async () => {
    const lena = await signUp('lena');
    await Promise.all(Array.from({ length: 6 }, (_, i) => createOk(lena.token, { title: `Note ${i}` })));
    const { items, total } = await listOk(lena.token);
    expect(total).toBe(6);
    expect(items).toHaveLength(6);
    for (let i = 1; i < items.length; i += 1) {
      const a = items[i - 1];
      const b = items[i];
      if (a === undefined || b === undefined) throw new Error('missing item');
      const ordered = a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id < b.id);
      expect(ordered, `${a.updatedAt} ${a.id} before ${b.updatedAt} ${b.id}`).toBe(true);
    }
  });

  it('returns the list envelope and validates paging', async () => {
    const lena = await signUp('lena');
    await createOk(lena.token, { title: 'Older' });
    await tick();
    await createOk(lena.token, { title: 'Newer' });

    const all = await listOk(lena.token);
    expect(all).toMatchObject({ total: 2, limit: 20, offset: 0 });
    expect(all.items.map((note) => note.title)).toEqual(['Newer', 'Older']);

    const page = await listOk(lena.token, '?limit=1&offset=1');
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.items.map((note) => note.title)).toEqual(['Older']);

    expectValidationError(await listNotes(lena.token, '?limit=0'), 'limit');
    expectValidationError(await listNotes(lena.token, '?offset=-1'), 'offset');

    const pastEnd = await listOk(lena.token, '?offset=5');
    expect(pastEnd).toEqual({ items: [], total: 2, limit: 20, offset: 5 });
  });

  it('returns an empty envelope for a user without notes', async () => {
    const kim = await signUp('kim');
    expect(await listOk(kim.token)).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });
});

describe('AC4: edit the tags and delete a note', () => {
  it('replaces the tag list, then deletes the note', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, {
      title: 'Q3 planning',
      body: 'Hiring and budget',
      tags: ['budget', 'planning'],
    });

    const retagged = await patchOk(lena.token, note.id, { tags: ['ideas'] });
    expect(retagged.tags).toEqual(['ideas']);
    expect(retagged.title).toBe('Q3 planning');
    expect(retagged.body).toBe('Hiring and budget');

    const deleted = await deleteNote(lena.token, note.id);
    expect(deleted.statusCode, deleted.body).toBe(204);
    expect(deleted.body).toBe('');

    expectError(await getNote(lena.token, note.id), 404, 'NOT_FOUND');
    expect((await listOk(lena.token)).items.map((item) => item.id)).not.toContain(note.id);
    expectError(await deleteNote(lena.token, note.id), 404, 'NOT_FOUND');
  });

  it('clears the tags with an empty list', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'Tagged', tags: ['a'] });
    expect((await patchOk(lena.token, note.id, { tags: [] })).tags).toEqual([]);
  });
});

describe('AC5: invalid notes are rejected', () => {
  it('rejects invalid create bodies with the contract detail paths', async () => {
    const lena = await signUp('lena');
    expectValidationError(await createNote(lena.token, { title: '' }), 'title');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: ['ok', 'road map'] }), 'tags.1');
    const eleven = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: eleven }), 'tags');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', body: null }), 'body');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: [5] }), 'tags.0');
    expectValidationError(await createNote(lena.token, { title: 'a'.repeat(121) }), 'title');
    expect((await listOk(lena.token)).total).toBe(0);
  });

  it('applies the tag and body limits at their boundaries', async () => {
    const lena = await signUp('lena');

    // 11 entries that collapse to 10 distinct tags are accepted, normalised and sorted.
    const ten = Array.from({ length: 10 }, (_, i) => `t${9 - i}`);
    const collapsed = await createOk(lena.token, { title: 'Ten', tags: [...ten, ' T3 '] });
    expect(collapsed.tags).toEqual([...ten].sort());

    const longest = 'a-0'.repeat(10);
    expect((await createOk(lena.token, { title: 'Long tag', tags: [longest] })).tags).toEqual([longest]);
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: ['ok', `${longest}b`] }), 'tags.1');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: ['under_score'] }), 'tags.0');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: ['   '] }), 'tags.0');
    expectValidationError(await createNote(lena.token, { title: 'Ideas', tags: 'budget' }), 'tags');

    const body = 'b'.repeat(20_000);
    expect((await createOk(lena.token, { title: 'Max body', body })).body).toBe(body);
    expectValidationError(await createNote(lena.token, { title: 'Too long', body: `${body}b` }), 'body');

    expect((await listOk(lena.token)).total).toBe(3);
  });

  it('rejects invalid update bodies before looking up the note', async () => {
    const lena = await signUp('lena');
    const note = await createOk(lena.token, { title: 'Ideas' });
    expectValidationError(await patchNote(lena.token, note.id, { title: '  ' }), 'title');
    expectValidationError(await patchNote(lena.token, note.id, { body: null }), 'body');
    expectValidationError(await patchNote(lena.token, note.id, { tags: null }), 'tags');
    expectValidationError(await patchNote(lena.token, UNKNOWN_ID, { title: '' }), 'title');
    expect((await getNote(lena.token, note.id)).json<Note>()).toEqual(note);
  });

  it('rejects NUL characters and unpaired surrogates with 400, never 500', async () => {
    const lena = await signUp('lena');
    expectValidationError(await createNote(lena.token, { title: 'a\u0000b' }), 'title');
    expectValidationError(await createNote(lena.token, { title: 'x', body: 'l\u0000' }), 'body');
    expectValidationError(await createNote(lena.token, { title: 'x', body: '\ud800' }), 'body');
    const note = await createOk(lena.token, { title: 'x' });
    expectValidationError(await patchNote(lena.token, note.id, { title: 'a\u0000' }), 'title');
    expectValidationError(await patchNote(lena.token, note.id, { body: '\udfff' }), 'body');
  });
});

describe('AC6: body kept exactly as written', () => {
  it('trims the title and returns the body verbatim', async () => {
    const lena = await signUp('lena');
    const body = '  first line\nsecond\n';
    const note = await createOk(lena.token, { title: '  Standup  ', body });
    expect(note.title).toBe('Standup');
    expect(note.body).toBe(body);
    const fetched = (await getNote(lena.token, note.id)).json<Note>();
    expect(fetched.title).toBe('Standup');
    expect(fetched.body).toBe(body);
  });

  it('round-trips CRLF line breaks, whitespace-only text and emoji exactly', async () => {
    const lena = await signUp('lena');
    for (const body of ['a\r\nb\r\n 😀 ', '   ']) {
      const note = await createOk(lena.token, { title: 'Raw', body });
      expect(note.body).toBe(body);
      expect((await getNote(lena.token, note.id)).json<Note>().body).toBe(body);
    }
  });
});
