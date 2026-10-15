import { AUTH_TOKEN_STORAGE_KEY, type Note } from '@app/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import {
  changedFields,
  parseTagsInput,
  toCreateBody,
  type NoteFormValues,
} from '../src/components/note-form-values';

const user = { id: 'u1', email: 'lena@example.test', name: 'Lena', createdAt: '2026-01-01T00:00:00.000Z' };
const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    ownerId: user.id,
    title: 'Q3 planning',
    body: 'Hiring and budget',
    tags: ['budget', 'planning'],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function emptyResponse(): Response {
  return new Response(null, { status: 204 });
}

function errorResponse(status: number, code: string, details?: { path: string; message: string }[]): Response {
  return jsonResponse(status, { error: { code, message: code, details } });
}

type Handler = (body: unknown) => Response;

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Routes mocked fetch calls by "METHOD /path" (path without /api/v1 and the query string).
 * `/auth/me` answers with the signed-in user unless overridden. Records every call.
 */
function mockApi(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://x');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: `${path}${url.search}`, body });
    const key = `${method} ${path}`;
    const handler = routes[key] ?? (key === 'GET /auth/me' ? () => jsonResponse(200, user) : undefined);
    if (handler === undefined) return Promise.resolve(errorResponse(404, 'NOT_FOUND'));
    return Promise.resolve(handler(body));
  });
  return calls;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function inputValue(testId: string): string {
  const element = screen.getByTestId(testId);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`${testId} is not a text control`);
  }
  return element.value;
}

describe('notes pages', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
  });
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows nav-notes in the nav bar, linking to /notes', async () => {
    mockApi(fetchMock, {});
    renderAt('/');
    const link = await screen.findByTestId('nav-notes');
    expect(link.getAttribute('href')).toBe('/notes');
  });

  it('lists notes in API order with titles and tags, fetching up to 100', async () => {
    const first = makeNote({ id: OTHER_ID, title: 'Retro notes (final)', tags: [] });
    const second = makeNote();
    const calls = mockApi(fetchMock, {
      'GET /notes': () => jsonResponse(200, { items: [first, second], total: 2, limit: 100, offset: 0 }),
    });
    renderAt('/notes');
    expect((await screen.findByTestId(`notes-title-${NOTE_ID}`)).textContent).toBe('Q3 planning');
    const rows = screen.getAllByTestId(/^notes-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([`notes-row-${OTHER_ID}`, `notes-row-${NOTE_ID}`]);
    expect(rows[1]?.querySelector('a')?.getAttribute('href')).toBe(`/notes/${NOTE_ID}`);
    expect(screen.getByTestId(`notes-tags-${NOTE_ID}`).textContent).toContain('budget');
    expect(screen.getByTestId(`notes-tags-${NOTE_ID}`).textContent).toContain('planning');
    expect(screen.getByTestId('notes-new').getAttribute('href')).toBe('/notes/new');
    expect(screen.queryByTestId('notes-empty')).toBeNull();
    expect(screen.queryByTestId('notes-more')).toBeNull();
    expect(calls.find((call) => call.path.startsWith('/notes'))?.path).toBe('/notes?limit=100');
  });

  it('renders notes-empty only when there are no notes', async () => {
    mockApi(fetchMock, {
      'GET /notes': () => jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }),
    });
    renderAt('/notes');
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(screen.queryAllByTestId(/^notes-row-/)).toHaveLength(0);
    expect(screen.queryByTestId('notes-more')).toBeNull();
  });

  it('renders notes-more when the total exceeds the loaded items', async () => {
    mockApi(fetchMock, {
      'GET /notes': () => jsonResponse(200, { items: [makeNote()], total: 101, limit: 100, offset: 0 }),
    });
    renderAt('/notes');
    expect((await screen.findByTestId('notes-more')).textContent).toContain('101');
  });

  it('shows notes-error when the list fails', async () => {
    mockApi(fetchMock, { 'GET /notes': () => errorResponse(500, 'INTERNAL') });
    renderAt('/notes');
    expect((await screen.findByTestId('notes-error')).getAttribute('data-error-code')).toBe('INTERNAL');
  });

  it('creates a note, sending the raw tag segments, and opens its page', async () => {
    const created = makeNote();
    const calls = mockApi(fetchMock, {
      'POST /notes': () => jsonResponse(201, created),
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, created),
    });
    renderAt('/notes/new');
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: 'Q3 planning' } });
    fireEvent.change(screen.getByTestId('note-form-body'), { target: { value: 'Hiring and budget' } });
    fireEvent.change(screen.getByTestId('note-form-tags'), { target: { value: 'Planning, budget, planning' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));

    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Q3 planning');
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      title: 'Q3 planning',
      body: 'Hiring and budget',
      tags: ['Planning', 'budget', 'planning'],
    });
    expect(screen.getByTestId('note-detail-body').textContent).toBe('Hiring and budget');
    expect(screen.getByTestId('note-detail-tag-budget').textContent).toBe('budget');
    expect(screen.getByTestId('note-detail-tag-planning').textContent).toBe('planning');
  });

  it('shows the API error code on the note form', async () => {
    mockApi(fetchMock, {
      'POST /notes': () => errorResponse(400, 'VALIDATION_FAILED', [{ path: 'title', message: 'Required' }]),
    });
    renderAt('/notes/new');
    expect(screen.queryByTestId('note-form-error')).toBeNull();
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    const error = await screen.findByTestId('note-form-error');
    expect(error.getAttribute('data-error-code')).toBe('VALIDATION_FAILED');
  });

  it('renders app-not-found for a note the API reports as 404', async () => {
    mockApi(fetchMock, {});
    renderAt(`/notes/${NOTE_ID}`);
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
    expect(screen.getByTestId('nav-notes')).toBeTruthy();
  });

  it('renders app-not-found on the edit page for a missing note', async () => {
    mockApi(fetchMock, {});
    renderAt(`/notes/${NOTE_ID}/edit`);
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
    expect(screen.queryByTestId('note-form-title')).toBeNull();
  });

  it('shows edit and delete only to the owner', async () => {
    mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, makeNote({ ownerId: 'someone-else' })),
    });
    renderAt(`/notes/${NOTE_ID}`);
    expect(await screen.findByTestId('note-detail-title')).toBeTruthy();
    expect(screen.queryByTestId('note-detail-edit')).toBeNull();
    expect(screen.queryByTestId('note-detail-delete')).toBeNull();
  });

  it('prefills the edit form with the stored values', async () => {
    mockApi(fetchMock, { [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, makeNote()) });
    renderAt(`/notes/${NOTE_ID}/edit`);
    await screen.findByTestId('note-form-title');
    expect(inputValue('note-form-title')).toBe('Q3 planning');
    expect(inputValue('note-form-body')).toBe('Hiring and budget');
    expect(inputValue('note-form-tags')).toBe('budget, planning');
  });

  it('sends PATCH {} for an untouched edit, even when the stored body has CRLF line breaks', async () => {
    const note = makeNote({ body: '  first\r\nsecond\r\n' });
    const calls = mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, note),
      [`PATCH /notes/${NOTE_ID}`]: () => jsonResponse(200, note),
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    expect(await screen.findByTestId('note-detail-title')).toBeTruthy();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({});
  });

  it('sends only the title when only the title changed', async () => {
    let note = makeNote();
    const calls = mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, note),
      [`PATCH /notes/${NOTE_ID}`]: () => {
        note = { ...note, title: 'Q4 planning' };
        return jsonResponse(200, note);
      },
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: 'Q4 planning' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));
    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Q4 planning');
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ title: 'Q4 planning' });
  });

  it('sends only the tags when only the tags changed', async () => {
    let note = makeNote();
    const calls = mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, note),
      [`PATCH /notes/${NOTE_ID}`]: () => {
        note = { ...note, tags: ['ideas'] };
        return jsonResponse(200, note);
      },
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.change(await screen.findByTestId('note-form-tags'), { target: { value: 'ideas' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));
    expect(await screen.findByTestId('note-detail-tag-ideas')).toBeTruthy();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ tags: ['ideas'] });
    expect(screen.queryByTestId('note-detail-tag-budget')).toBeNull();
  });

  it('deletes the note at once and goes to the notes page', async () => {
    const calls = mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, makeNote()),
      [`DELETE /notes/${NOTE_ID}`]: () => emptyResponse(),
      'GET /notes': () => jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }),
    });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === `/notes/${NOTE_ID}`)).toBe(true);
  });

  it('shows app-not-found when the note vanished before delete', async () => {
    mockApi(fetchMock, { [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, makeNote()) });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
  });

  it('shows note-detail-error and re-enables delete when delete fails otherwise', async () => {
    mockApi(fetchMock, {
      [`GET /notes/${NOTE_ID}`]: () => jsonResponse(200, makeNote()),
      [`DELETE /notes/${NOTE_ID}`]: () => errorResponse(500, 'INTERNAL'),
    });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect((await screen.findByTestId('note-detail-error')).getAttribute('data-error-code')).toBe('INTERNAL');
    await waitFor(() => {
      expect(screen.getByTestId<HTMLButtonElement>('note-detail-delete').disabled).toBe(false);
    });
  });
});

describe('note form helpers', () => {
  const initial: NoteFormValues = { title: 'Q3 planning', body: 'a\r\nb', tags: 'budget, planning' };

  it('parseTagsInput splits on commas, trims and drops empty segments', () => {
    expect(parseTagsInput('Planning, budget, planning')).toEqual(['Planning', 'budget', 'planning']);
    expect(parseTagsInput(' , a,, b ,')).toEqual(['a', 'b']);
    expect(parseTagsInput('')).toEqual([]);
  });

  it('toCreateBody sends the title raw, the body verbatim and the parsed tags', () => {
    expect(toCreateBody({ title: '  Standup  ', body: '  x\n', tags: 'a, b' })).toEqual({
      title: '  Standup  ',
      body: '  x\n',
      tags: ['a', 'b'],
    });
  });

  it('changedFields returns {} for identical values', () => {
    expect(changedFields(initial, { ...initial })).toEqual({});
  });

  it('changedFields omits tags when only the spacing in the tags text differs', () => {
    expect(changedFields(initial, { ...initial, tags: 'budget,planning ,' })).toEqual({});
  });

  it('changedFields returns only the fields that differ', () => {
    expect(changedFields(initial, { ...initial, title: 'New' })).toEqual({ title: 'New' });
    expect(changedFields(initial, { ...initial, body: 'a\nb' })).toEqual({ body: 'a\nb' });
    expect(changedFields(initial, { ...initial, tags: 'ideas' })).toEqual({ tags: ['ideas'] });
    expect(changedFields(initial, { ...initial, tags: '' })).toEqual({ tags: [] });
  });
});
