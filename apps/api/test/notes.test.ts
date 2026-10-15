import { randomUUID } from 'node:crypto';
import type { ListResponse, Note } from '@app/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notes } from '../src/db/schema';
import { bearer, createTestApp, expectError, expectValidationError, registerUser } from './helpers';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

function create(token: string, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/notes', headers: bearer(token), payload: payload as object });
}

function list(token: string, query = '') {
  return app.inject({ method: 'GET', url: `/api/v1/notes${query}`, headers: bearer(token) });
}

function get(token: string, noteId: string) {
  return app.inject({ method: 'GET', url: `/api/v1/notes/${noteId}`, headers: bearer(token) });
}

function patch(token: string, noteId: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/notes/${noteId}`,
    headers: bearer(token),
    payload: payload as object,
  });
}

function remove(token: string, noteId: string) {
  return app.inject({ method: 'DELETE', url: `/api/v1/notes/${noteId}`, headers: bearer(token) });
}

async function createNote(token: string, payload: { title: string; body?: string; tags?: string[] }): Promise<Note> {
  const response = await create(token, payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Note>();
}

async function listItems(token: string): Promise<Note[]> {
  const response = await list(token, '?limit=100');
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ListResponse<Note>>().items;
}

describe('POST /api/v1/notes', () => {
  it('creates a note owned by the caller with normalised tags', async () => {
    const lena = await registerUser(app);
    const response = await create(lena.token, {
      title: 'Q3 planning',
      body: 'Hiring and budget',
      tags: ['Planning', 'budget', 'planning'],
    });
    expect(response.statusCode, response.body).toBe(201);
    const note = response.json<Note>();
    expect(note.id).toMatch(UUID);
    expect(note.ownerId).toBe(lena.user.id);
    expect(note.title).toBe('Q3 planning');
    expect(note.body).toBe('Hiring and budget');
    expect(note.tags).toEqual(['budget', 'planning']);
    expect(note.createdAt).toMatch(ISO_INSTANT);
    expect(note.updatedAt).toBe(note.createdAt);
  });

  it('trims the title, keeps the body verbatim and defaults body and tags', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: '  Standup  ', body: '  Hiring\n' });
    expect(note.title).toBe('Standup');
    expect(note.body).toBe('  Hiring\n');
    expect(note.tags).toEqual([]);

    const bare = await createNote(lena.token, { title: 'Bare' });
    expect(bare.body).toBe('');
    expect(bare.tags).toEqual([]);
    const fetched = await get(lena.token, note.id);
    expect(fetched.json<Note>().body).toBe('  Hiring\n');
  });

  it('ignores client-supplied ownerId, id and timestamps', async () => {
    const lena = await registerUser(app);
    const sam = await registerUser(app);
    const note = await createNote(lena.token, {
      title: 'Mine',
      ownerId: sam.user.id,
      id: UNKNOWN_ID,
      createdAt: '2000-01-01T00:00:00.000Z',
    } as { title: string });
    expect(note.ownerId).toBe(lena.user.id);
    expect(note.id).not.toBe(UNKNOWN_ID);
    expect(note.createdAt.startsWith('2000')).toBe(false);
  });

  it('rejects invalid notes with 400 and the field path', async () => {
    const lena = await registerUser(app);
    expectValidationError(await create(lena.token, { title: '' }), 'title');
    expectValidationError(await create(lena.token, { title: '   ' }), 'title');
    expectValidationError(await create(lena.token, {}), 'title');
    expectValidationError(await create(lena.token, { title: 'Ideas', tags: ['ok', 'road map'] }), 'tags.1');
    const eleven = Array.from({ length: 11 }, (_, i) => `tag-${String(i)}`);
    expectValidationError(await create(lena.token, { title: 'Ideas', tags: eleven }), 'tags');
    expectValidationError(await create(lena.token, { title: 'Ideas', body: null }), 'body');
    expectValidationError(await create(lena.token, { title: 'Ideas', tags: null }), 'tags');
    expectValidationError(await create(lena.token, { title: 'a'.repeat(121) }), 'title');
    expectValidationError(await create(lena.token, { title: 'Ideas', body: 'a\u0000b' }), 'body');
    expect(await listItems(lena.token)).toEqual([]);
  });

  it('accepts eleven tag entries that collapse to ten distinct tags', async () => {
    const lena = await registerUser(app);
    const ten = Array.from({ length: 10 }, (_, i) => `tag-${String(i)}`);
    const note = await createNote(lena.token, { title: 'Ideas', tags: [...ten, 'TAG-0'] });
    expect(note.tags).toHaveLength(10);
  });
});

describe('privacy (NOTE-4)', () => {
  it("answers 404 for another user's note and keeps it out of their list", async () => {
    const lena = await registerUser(app);
    const sam = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Q3 planning', tags: ['budget'] });

    expectError(await get(sam.token, note.id), 404, 'NOT_FOUND');
    expectError(await patch(sam.token, note.id, { title: 'Hacked' }), 404, 'NOT_FOUND');
    expectError(await remove(sam.token, note.id), 404, 'NOT_FOUND');
    expect((await listItems(sam.token)).map((n) => n.id)).not.toContain(note.id);

    const unchanged = await get(lena.token, note.id);
    expect(unchanged.json<Note>()).toEqual(note);
  });

  it('answers 404 for malformed and unknown ids on every item route', async () => {
    const lena = await registerUser(app);
    for (const noteId of ['abc', '%20', UNKNOWN_ID]) {
      expectError(await get(lena.token, noteId), 404, 'NOT_FOUND');
      expectError(await patch(lena.token, noteId, { title: 'x' }), 404, 'NOT_FOUND');
      expectError(await remove(lena.token, noteId), 404, 'NOT_FOUND');
    }
  });

  it('accepts an upper-case id', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Upper' });
    const response = await get(lena.token, note.id.toUpperCase());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<Note>().id).toBe(note.id);
  });

  it('validates the PATCH body before looking up the note', async () => {
    const lena = await registerUser(app);
    expectValidationError(await patch(lena.token, UNKNOWN_ID, { title: '' }), 'title');
  });
});

describe('ordering and updatedAt (NOTE-5, NOTE-6)', () => {
  it('lists the most recently updated note first and skips no-op writes', async () => {
    const lena = await registerUser(app);
    const retro = await createNote(lena.token, { title: 'Retro notes' });
    const q3 = await createNote(lena.token, { title: 'Q3 planning' });
    expect((await listItems(lena.token)).map((n) => n.id)).toEqual([q3.id, retro.id]);

    const renamed = await patch(lena.token, retro.id, { title: 'Retro notes (final)' });
    expect(renamed.statusCode, renamed.body).toBe(200);
    const retroAfter = renamed.json<Note>();
    expect(retroAfter.title).toBe('Retro notes (final)');
    expect(retroAfter.createdAt).toBe(retro.createdAt);
    expect(Date.parse(retroAfter.updatedAt)).toBeGreaterThan(Date.parse(q3.updatedAt));
    const ordered = await listItems(lena.token);
    expect(ordered.map((n) => n.title)).toEqual(['Retro notes (final)', 'Q3 planning']);

    const saved = await patch(lena.token, q3.id, { title: 'Q3 planning' });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<Note>().updatedAt).toBe(q3.updatedAt);
    const untouched = await patch(lena.token, q3.id, {});
    expect(untouched.statusCode, untouched.body).toBe(200);
    expect(untouched.json<Note>()).toEqual(q3);
    const padded = await patch(lena.token, q3.id, { title: '  Q3 planning  ' });
    expect(padded.json<Note>().updatedAt).toBe(q3.updatedAt);
    expect(await listItems(lena.token)).toEqual(ordered);
  });

  it('treats re-ordered tags that normalise to the stored list as no change', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Tags', tags: ['budget', 'planning'] });
    const response = await patch(lena.token, note.id, { tags: ['Planning', 'budget'] });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<Note>().updatedAt).toBe(note.updatedAt);
  });

  it('gives sequential writes strictly increasing updatedAt values', async () => {
    const lena = await registerUser(app);
    const created: Note[] = [];
    for (let i = 0; i < 5; i += 1) created.push(await createNote(lena.token, { title: `Note ${String(i)}` }));
    for (let i = 1; i < created.length; i += 1) {
      expect(Date.parse(created[i]?.updatedAt ?? '')).toBeGreaterThan(Date.parse(created[i - 1]?.updatedAt ?? ''));
    }
    expect((await listItems(lena.token)).map((n) => n.id)).toEqual(created.map((n) => n.id).toReversed());
  });

  it('breaks updatedAt ties by id ascending, also across pages', async () => {
    // The API never stamps two of one owner's sequential writes alike, so the tie is made directly.
    const lena = await registerUser(app);
    const tiedAt = new Date('2020-01-01T00:00:00.000Z');
    const [lowId, highId] = [randomUUID(), randomUUID()].toSorted();
    if (lowId === undefined || highId === undefined) throw new Error('expected two ids');
    // Inserted high id first, so insertion order cannot pass for id order.
    for (const id of [highId, lowId]) {
      await app.db
        .insert(notes)
        .values({ id, ownerId: lena.user.id, title: `Tied ${id}`, createdAt: tiedAt, updatedAt: tiedAt });
    }
    const latest = await createNote(lena.token, { title: 'Latest' }); // stamped now: listed before the tie

    expect((await listItems(lena.token)).map((n) => n.id)).toEqual([latest.id, lowId, highId]);
    const second = (await list(lena.token, '?limit=1&offset=1')).json<ListResponse<Note>>();
    const third = (await list(lena.token, '?limit=1&offset=2')).json<ListResponse<Note>>();
    expect([second.items[0]?.id, third.items[0]?.id]).toEqual([lowId, highId]);
  });
});

describe('PATCH and DELETE /api/v1/notes/:noteId', () => {
  it('replaces the tags, then deletes the note', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Q3 planning', body: 'keep', tags: ['budget', 'planning'] });

    const edited = await patch(lena.token, note.id, { tags: ['ideas'] });
    expect(edited.statusCode, edited.body).toBe(200);
    const after = edited.json<Note>();
    expect(after.tags).toEqual(['ideas']);
    expect(after.title).toBe('Q3 planning');
    expect(after.body).toBe('keep');
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(note.updatedAt));

    const cleared = await patch(lena.token, note.id, { tags: [] });
    expect(cleared.json<Note>().tags).toEqual([]);

    const deleted = await remove(lena.token, note.id);
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    expectError(await get(lena.token, note.id), 404, 'NOT_FOUND');
    expectError(await remove(lena.token, note.id), 404, 'NOT_FOUND');
    expect((await listItems(lena.token)).map((n) => n.id)).not.toContain(note.id);
  });

  it('rejects invalid PATCH bodies', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Valid' });
    expectValidationError(await patch(lena.token, note.id, { title: '  ' }), 'title');
    expectValidationError(await patch(lena.token, note.id, { body: null }), 'body');
    expectValidationError(await patch(lena.token, note.id, { tags: ['ok', 'road map'] }), 'tags.1');
    expect((await get(lena.token, note.id)).json<Note>()).toEqual(note);
  });

  it('serialises concurrent PATCHes of one note', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Start' });
    const [first, second] = await Promise.all([
      patch(lena.token, note.id, { title: 'First' }),
      patch(lena.token, note.id, { title: 'Second' }),
    ]);
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    const a = first.json<Note>();
    const b = second.json<Note>();
    expect(a.updatedAt).not.toBe(b.updatedAt);
    const later = Date.parse(a.updatedAt) > Date.parse(b.updatedAt) ? a : b;
    const final = (await get(lena.token, note.id)).json<Note>();
    expect(final.title).toBe(later.title);
    expect(final.updatedAt).toBe(later.updatedAt);
  });
});

describe('GET /api/v1/notes', () => {
  it('returns the list envelope and honours limit and offset', async () => {
    const lena = await registerUser(app);
    const created: Note[] = [];
    for (const title of ['One', 'Two', 'Three']) created.push(await createNote(lena.token, { title }));

    const first = await list(lena.token);
    expect(first.statusCode, first.body).toBe(200);
    const all = first.json<ListResponse<Note>>();
    expect(all).toMatchObject({ total: 3, limit: 20, offset: 0 });
    expect(all.items.map((n) => n.title)).toEqual(['Three', 'Two', 'One']);

    const page = (await list(lena.token, '?limit=1&offset=1')).json<ListResponse<Note>>();
    expect(page).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(page.items.map((n) => n.title)).toEqual(['Two']);
  });

  it('rejects invalid paging values', async () => {
    const lena = await registerUser(app);
    expectValidationError(await list(lena.token, '?limit=0'), 'limit');
    expectValidationError(await list(lena.token, '?limit=101'), 'limit');
    expectValidationError(await list(lena.token, '?offset=-1'), 'offset');
  });
});

describe('authentication', () => {
  it('answers 401 without a token on all five routes', async () => {
    const lena = await registerUser(app);
    const note = await createNote(lena.token, { title: 'Secret' });
    const requests = [
      app.inject({ method: 'POST', url: '/api/v1/notes', payload: { title: 'x' } }),
      app.inject({ method: 'GET', url: '/api/v1/notes' }),
      app.inject({ method: 'GET', url: `/api/v1/notes/${note.id}` }),
      app.inject({ method: 'PATCH', url: `/api/v1/notes/${note.id}`, payload: { title: 'x' } }),
      app.inject({ method: 'DELETE', url: `/api/v1/notes/${note.id}` }),
    ];
    for (const response of await Promise.all(requests)) expectError(response, 401, 'UNAUTHENTICATED');
  });
});
