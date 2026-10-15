import { AUTH_TOKEN_STORAGE_KEY, type Note } from '@app/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { formatTagsInput, noteChanges, parseTagsInput, toFormValues } from '../src/notes/formValues';

const user = { id: 'u1', email: 'lena@example.test', name: 'Lena', createdAt: '2026-01-01T00:00:00.000Z' };
const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    ownerId: user.id,
    title: 'Standup',
    body: 'line one\nline two',
    tags: ['meeting', 'work'],
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const notFoundBody = { error: { code: 'NOT_FOUND', message: 'Not found' } };
const validationBody = {
  error: { code: 'VALIDATION_FAILED', message: 'Invalid request', details: [{ path: 'title', message: 'Required' }] },
};

type Handler = (method: string, path: string, body: unknown) => Response | undefined;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('notes pages', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const requests: { method: string; path: string; body: unknown }[] = [];

  /** Routes every request: /auth/me answers the signed-in user, the rest goes to `handler`. */
  function serve(handler: Handler) {
    fetchMock.mockImplementation((input, init) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, 'http://localhost');
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace('/api/v1', '') + url.search;
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      requests.push({ method, path, body });
      if (path === '/auth/me') return Promise.resolve(jsonResponse(200, user));
      return Promise.resolve(handler(method, path, body) ?? jsonResponse(404, notFoundBody));
    });
  }

  function requestsTo(method: string) {
    return requests.filter((request) => request.method === method);
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
    requests.length = 0;
  });
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('lists the notes in API order with titles, tags and links', async () => {
    const first = makeNote({ id: OTHER_ID, title: 'Ideas', tags: ['x'] });
    const second = makeNote();
    serve((method, path) =>
      method === 'GET' && path.startsWith('/notes?')
        ? jsonResponse(200, { items: [first, second], total: 2, limit: 100, offset: 0 })
        : undefined,
    );
    renderAt('/notes');

    const rows = await screen.findAllByTestId(/^notes-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      `notes-row-${OTHER_ID}`,
      `notes-row-${NOTE_ID}`,
    ]);
    expect(screen.getByTestId(`notes-title-${NOTE_ID}`).textContent).toBe('Standup');
    expect(screen.getByTestId(`notes-tags-${NOTE_ID}`).textContent).toContain('meeting');
    expect(screen.getByTestId(`notes-tags-${NOTE_ID}`).textContent).toContain('work');
    expect(rows[1]?.querySelector('a[href]')?.getAttribute('href')).toBe(`/notes/${NOTE_ID}`);
    expect(screen.getByTestId('notes-new').getAttribute('href')).toBe('/notes/new');
    expect(screen.queryByTestId('notes-empty')).toBeNull();
    expect(requestsTo('GET').some((request) => request.path === '/notes?limit=100')).toBe(true);
  });

  it('shows the empty state and the nav link', async () => {
    serve((method, path) =>
      method === 'GET' && path.startsWith('/notes?')
        ? jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 })
        : undefined,
    );
    renderAt('/notes');
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(screen.queryAllByTestId(/^notes-row-/)).toHaveLength(0);
    expect(screen.getByTestId('nav-notes').getAttribute('href')).toBe('/notes');
  });

  it('shows the detail page with tags and owner controls', async () => {
    serve((method, path) => (method === 'GET' && path === `/notes/${NOTE_ID}` ? jsonResponse(200, makeNote()) : undefined));
    renderAt(`/notes/${NOTE_ID}`);

    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Standup');
    expect(screen.getByTestId('note-detail-body').textContent).toBe('line one\nline two');
    expect(screen.getByTestId('note-detail-tag-meeting').textContent).toBe('meeting');
    expect(screen.getByTestId('note-detail-tag-work').textContent).toBe('work');
    expect(screen.getByTestId('note-detail-edit').getAttribute('href')).toBe(`/notes/${NOTE_ID}/edit`);
    expect(screen.getByTestId('note-detail-delete')).toBeTruthy();
  });

  it('hides the owner controls from a non-owner', async () => {
    serve((method, path) =>
      method === 'GET' && path === `/notes/${NOTE_ID}` ? jsonResponse(200, makeNote({ ownerId: 'u2' })) : undefined,
    );
    renderAt(`/notes/${NOTE_ID}`);
    expect(await screen.findByTestId('note-detail-title')).toBeTruthy();
    expect(screen.queryByTestId('note-detail-edit')).toBeNull();
    expect(screen.queryByTestId('note-detail-delete')).toBeNull();
  });

  it('deletes at once and returns to the list', async () => {
    let deleted = false;
    serve((method, path) => {
      if (method === 'GET' && path === `/notes/${NOTE_ID}`) return jsonResponse(200, makeNote());
      if (method === 'DELETE' && path === `/notes/${NOTE_ID}`) {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (method === 'GET' && path.startsWith('/notes?')) {
        return jsonResponse(200, { items: deleted ? [] : [makeNote()], total: deleted ? 0 : 1, limit: 100, offset: 0 });
      }
      return undefined;
    });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(deleted).toBe(true);
  });

  it.each([`/notes/abc`, `/notes/abc/edit`])('renders app-not-found when the API answers 404 (%s)', async (path) => {
    serve(() => undefined);
    renderAt(path);
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
    expect(screen.getByTestId('nav-notes')).toBeTruthy();
  });

  it('prefills the edit form with the stored values', async () => {
    serve((method, path) =>
      method === 'GET' && path === `/notes/${NOTE_ID}`
        ? jsonResponse(200, makeNote({ title: 'Standup', body: '  spaced\nbody ' }))
        : undefined,
    );
    renderAt(`/notes/${NOTE_ID}/edit`);
    const title = await screen.findByTestId<HTMLInputElement>('note-form-title');
    expect(title.value).toBe('Standup');
    expect(screen.getByTestId<HTMLTextAreaElement>('note-form-body').value).toBe('  spaced\nbody ');
    expect(screen.getByTestId<HTMLInputElement>('note-form-tags').value).toBe('meeting, work');
  });

  it('sends PATCH {} for an unchanged edit and opens the note', async () => {
    serve((method, path) => {
      if (path !== `/notes/${NOTE_ID}`) return undefined;
      if (method === 'GET' || method === 'PATCH') return jsonResponse(200, makeNote());
      return undefined;
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    expect(await screen.findByTestId('note-detail-title')).toBeTruthy();
    expect(requestsTo('PATCH').map((request) => request.body)).toEqual([{}]);
  });

  it('sends only the title when only the title changed', async () => {
    let stored = makeNote();
    serve((method, path, body) => {
      if (path !== `/notes/${NOTE_ID}`) return undefined;
      if (method === 'PATCH') stored = { ...stored, ...(body as Partial<Note>) };
      return method === 'GET' || method === 'PATCH' ? jsonResponse(200, stored) : undefined;
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: 'Retro' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));
    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Retro');
    expect(requestsTo('PATCH').map((request) => request.body)).toEqual([{ title: 'Retro' }]);
  });

  it('creates a note with the parsed tags and opens it', async () => {
    serve((method, path, body) => {
      if (method === 'POST' && path === '/notes') return jsonResponse(201, makeNote({ ...(body as Partial<Note>) }));
      if (method === 'GET' && path === `/notes/${NOTE_ID}`) return jsonResponse(200, makeNote({ tags: ['a', 'b'] }));
      return undefined;
    });
    renderAt('/notes/new');
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: 'Plan' } });
    fireEvent.change(screen.getByTestId('note-form-body'), { target: { value: 'Body text' } });
    fireEvent.change(screen.getByTestId('note-form-tags'), { target: { value: 'a, , b' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));
    expect(await screen.findByTestId('note-detail-tag-a')).toBeTruthy();
    expect(requestsTo('POST').map((request) => request.body)).toEqual([
      { title: 'Plan', body: 'Body text', tags: ['a', 'b'] },
    ]);
  });

  it('shows the API error code when a submit fails validation', async () => {
    serve((method, path) => (method === 'POST' && path === '/notes' ? jsonResponse(400, validationBody) : undefined));
    renderAt('/notes/new');
    expect(screen.queryByTestId('note-form-error')).toBeNull();
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    const error = await screen.findByTestId('note-form-error');
    expect(error.getAttribute('data-error-code')).toBe('VALIDATION_FAILED');
    await waitFor(() => {
      expect(screen.getByTestId<HTMLButtonElement>('note-form-submit').disabled).toBe(false);
    });
  });

  it('keeps the user on the edit form with their input when the save fails validation', async () => {
    serve((method, path) => {
      if (path !== `/notes/${NOTE_ID}`) return undefined;
      if (method === 'GET') return jsonResponse(200, makeNote());
      if (method === 'PATCH') return jsonResponse(400, validationBody);
      return undefined;
    });
    renderAt(`/notes/${NOTE_ID}/edit`);
    fireEvent.change(await screen.findByTestId('note-form-tags'), { target: { value: 'ok, Bad Tag' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));

    const error = await screen.findByTestId('note-form-error');
    expect(error.getAttribute('data-error-code')).toBe('VALIDATION_FAILED');
    expect(screen.queryByTestId('note-detail-title')).toBeNull();
    expect(screen.getByTestId<HTMLInputElement>('note-form-tags').value).toBe('ok, Bad Tag');
    expect(requestsTo('PATCH').map((request) => request.body)).toEqual([{ tags: ['ok', 'Bad Tag'] }]);
  });

  it('shows the error and stays on the note when a delete fails', async () => {
    serve((method, path) => {
      if (path !== `/notes/${NOTE_ID}`) return undefined;
      if (method === 'GET') return jsonResponse(200, makeNote());
      if (method === 'DELETE') return jsonResponse(500, { error: { code: 'INTERNAL', message: 'Something broke' } });
      return undefined;
    });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));

    const error = await screen.findByTestId('note-detail-error');
    expect(error.getAttribute('data-error-code')).toBe('INTERNAL');
    expect(screen.getByTestId('note-detail-title').textContent).toBe('Standup');
    expect(screen.getByTestId<HTMLButtonElement>('note-detail-delete').disabled).toBe(false);
  });

  it('returns to the list when the note was already deleted elsewhere', async () => {
    serve((method, path) => {
      if (method === 'GET' && path === `/notes/${NOTE_ID}`) return jsonResponse(200, makeNote());
      if (method === 'GET' && path.startsWith('/notes?')) {
        return jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 });
      }
      return undefined; // DELETE answers 404
    });
    renderAt(`/notes/${NOTE_ID}`);
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(screen.queryByTestId('note-detail-error')).toBeNull();
  });

  it('shows the error instead of the empty state when the list fails to load', async () => {
    serve(() => jsonResponse(500, { error: { code: 'INTERNAL', message: 'Something broke' } }));
    renderAt('/notes');
    const error = await screen.findByTestId('notes-error');
    expect(error.getAttribute('data-error-code')).toBe('INTERNAL');
    expect(screen.queryByTestId('notes-empty')).toBeNull();
    expect(screen.getByTestId('notes-new')).toBeTruthy();
  });

  it('renders markup in the title and body as plain text', async () => {
    const title = '<b>bold</b>';
    const body = '<img src="x" onerror="alert(1)">\n<script>alert(2)</script>';
    serve((method, path) =>
      method === 'GET' && path === `/notes/${NOTE_ID}` ? jsonResponse(200, makeNote({ title, body })) : undefined,
    );
    renderAt(`/notes/${NOTE_ID}`);
    const heading = await screen.findByTestId('note-detail-title');
    const bodyElement = screen.getByTestId('note-detail-body');
    expect(heading.textContent).toBe(title);
    expect(bodyElement.textContent).toBe(body);
    expect(heading.querySelector('b')).toBeNull();
    expect(bodyElement.querySelector('img, script')).toBeNull();
  });
});

describe('note form values', () => {
  it('parses comma-separated tags, dropping blanks', () => {
    expect(parseTagsInput('a, , b')).toEqual(['a', 'b']);
    expect(parseTagsInput(' Work ,ideas,, ')).toEqual(['Work', 'ideas']);
    expect(parseTagsInput('')).toEqual([]);
  });

  it('formats tags for the input', () => {
    expect(formatTagsInput(['a', 'b'])).toBe('a, b');
    expect(formatTagsInput([])).toBe('');
  });

  it('returns only the changed fields', () => {
    const initial = toFormValues(makeNote({ title: 'T', body: 'B\r\n', tags: ['a', 'b'] }));
    expect(initial).toEqual({ title: 'T', body: 'B\r\n', tagsText: 'a, b' });
    expect(noteChanges(initial, { ...initial })).toEqual({});
    expect(noteChanges(initial, { ...initial, title: 'U' })).toEqual({ title: 'U' });
    expect(noteChanges(initial, { ...initial, body: '' })).toEqual({ body: '' });
    expect(noteChanges(initial, { ...initial, tagsText: '' })).toEqual({ tags: [] });
    expect(noteChanges(initial, { ...initial, tagsText: 'c, d' })).toEqual({ tags: ['c', 'd'] });
  });
});
