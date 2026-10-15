import { AUTH_TOKEN_STORAGE_KEY, type Note } from '@app/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import {
  createBodyFromForm,
  noteFormValues,
  parseTagsInput,
  updateBodyFromForm,
} from '../src/notes/note-form-values';

const user = { id: 'u1', email: 'lena@example.test', name: 'Lena', createdAt: '2026-01-01T00:00:00.000Z' };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
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

function listResponse(items: Note[]): Response {
  return jsonResponse(200, { items, total: items.length, limit: 100, offset: 0 });
}

function notFoundResponse(): Response {
  return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: Call) => Response | undefined;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('note form values', () => {
  it('splits comma-separated tags and drops empty segments only', () => {
    expect(parseTagsInput('Planning, budget, planning, ,')).toEqual(['Planning', 'budget', 'planning']);
    expect(parseTagsInput('')).toEqual([]);
  });

  it('builds the create body as typed', () => {
    expect(createBodyFromForm({ title: '  Standup  ', body: '  x\n', tagsText: 'a, b' })).toEqual({
      title: '  Standup  ',
      body: '  x\n',
      tags: ['a', 'b'],
    });
  });

  it('sends only the changed fields on edit', () => {
    const initial = noteFormValues(makeNote({ body: 'line one\r\nline two' }));
    expect(initial.tagsText).toBe('budget, planning');
    expect(updateBodyFromForm(initial, { ...initial })).toEqual({});
    expect(updateBodyFromForm(initial, { ...initial, tagsText: 'ideas' })).toEqual({ tags: ['ideas'] });
    expect(updateBodyFromForm(initial, { ...initial, title: 'Q4 planning' })).toEqual({ title: 'Q4 planning' });
    expect(updateBodyFromForm(initial, { ...initial, tagsText: '' })).toEqual({ tags: [] });
  });
});

describe('notes pages', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls: Call[] = [];

  /** Routes fetch calls: /auth/me answers with `user`, everything else goes to `handler`. */
  function serve(handler: Handler) {
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, 'http://localhost');
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\/api\/v1/, '') + url.search;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const call = { method, path, body };
      calls.push(call);
      if (path === '/auth/me') return Promise.resolve(jsonResponse(200, user));
      const response = handler(call);
      if (response === undefined) throw new Error(`unexpected request ${method} ${path}`);
      return Promise.resolve(response);
    });
  }

  function requests(method: string): Call[] {
    return calls.filter((call) => call.method === method);
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
    calls.length = 0;
  });
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows the empty state and the new-note link on /notes', async () => {
    serve(({ path }) => (path.startsWith('/notes?') ? listResponse([]) : undefined));
    renderAt('/notes');
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(screen.getByTestId('notes-new').getAttribute('href')).toBe('/notes/new');
    expect(screen.getByTestId('nav-notes').getAttribute('href')).toBe('/notes');
  });

  it('lists notes in API order with their tags', async () => {
    const first = makeNote({ id: 'n2', title: 'Retro notes (final)', tags: [] });
    const second = makeNote();
    serve(({ path }) => (path.startsWith('/notes?') ? listResponse([first, second]) : undefined));
    renderAt('/notes');
    await screen.findByTestId('notes-row-n2');
    const rows = screen.getAllByTestId(/^notes-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual(['notes-row-n2', 'notes-row-n1']);
    expect(rows[1]?.querySelector('a')?.getAttribute('href')).toBe('/notes/n1');
    expect(screen.getByTestId('notes-title-n1').textContent).toBe('Q3 planning');
    const tags = screen.getByTestId('notes-tags-n1').textContent;
    expect(tags).toContain('budget');
    expect(tags).toContain('planning');
    expect(screen.queryByTestId('notes-empty')).toBeNull();
  });

  it('creates a note and goes to its page', async () => {
    const created = makeNote({ id: 'n9' });
    serve(({ method, path }) => {
      if (method === 'POST' && path === '/notes') return jsonResponse(201, created);
      if (method === 'GET' && path === '/notes/n9') return jsonResponse(200, created);
      return undefined;
    });
    renderAt('/notes/new');
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: 'Q3 planning' } });
    fireEvent.change(screen.getByTestId('note-form-body'), { target: { value: 'Hiring and budget' } });
    fireEvent.change(screen.getByTestId('note-form-tags'), { target: { value: 'Planning, budget, planning' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));

    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Q3 planning');
    expect(requests('POST')[0]?.body).toEqual({
      title: 'Q3 planning',
      body: 'Hiring and budget',
      tags: ['Planning', 'budget', 'planning'],
    });
    expect(screen.getByTestId('note-detail-body').textContent).toBe('Hiring and budget');
    expect(screen.getByTestId('note-detail-tag-budget')).toBeTruthy();
    expect(screen.getByTestId('note-detail-tag-planning')).toBeTruthy();
  });

  it('sends the title and body exactly as typed and shows the body verbatim', async () => {
    const body = '  Hiring\n';
    const created = makeNote({ id: 'n8', title: 'Standup', body, tags: [] });
    serve(({ method, path }) => {
      if (method === 'POST' && path === '/notes') return jsonResponse(201, created);
      if (method === 'GET' && path === '/notes/n8') return jsonResponse(200, created);
      return undefined;
    });
    renderAt('/notes/new');
    fireEvent.change(await screen.findByTestId('note-form-title'), { target: { value: '  Standup  ' } });
    fireEvent.change(screen.getByTestId('note-form-body'), { target: { value: body } });
    fireEvent.click(screen.getByTestId('note-form-submit'));

    expect((await screen.findByTestId('note-detail-body')).textContent).toBe(body);
    expect(requests('POST')[0]?.body).toEqual({ title: '  Standup  ', body, tags: [] });
  });

  it('shows the API error code when a create is rejected', async () => {
    serve(({ method }) =>
      method === 'POST'
        ? jsonResponse(400, {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Validation failed',
              details: [{ path: 'title', message: 'Required' }],
            },
          })
        : undefined,
    );
    renderAt('/notes/new');
    expect(screen.queryByTestId('note-form-error')).toBeNull();
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    const error = await screen.findByTestId('note-form-error');
    expect(error.getAttribute('data-error-code')).toBe('VALIDATION_FAILED');
    expect(screen.getByTestId('note-form-submit').hasAttribute('disabled')).toBe(false);
  });

  it('renders app-not-found for a missing note', async () => {
    serve(({ path }) => (path === '/notes/x' ? notFoundResponse() : undefined));
    renderAt('/notes/x');
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
  });

  it('renders app-not-found on the edit page of a missing note', async () => {
    serve(({ path }) => (path === '/notes/x' ? notFoundResponse() : undefined));
    renderAt('/notes/x/edit');
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
  });

  it('prefills the edit form and sends only the changed tags', async () => {
    let note = makeNote({ body: '  Hiring\n' });
    serve(({ method, path, body }) => {
      if (path !== '/notes/n1') return undefined;
      if (method === 'PATCH') note = { ...note, ...(body as Partial<Note>) };
      return method === 'GET' || method === 'PATCH' ? jsonResponse(200, note) : undefined;
    });
    renderAt('/notes/n1/edit');
    const title = await screen.findByTestId<HTMLInputElement>('note-form-title');
    expect(title.value).toBe('Q3 planning');
    expect(screen.getByTestId<HTMLTextAreaElement>('note-form-body').value).toBe('  Hiring\n');
    expect(screen.getByTestId<HTMLInputElement>('note-form-tags').value).toBe('budget, planning');

    fireEvent.change(screen.getByTestId('note-form-tags'), { target: { value: 'ideas' } });
    fireEvent.click(screen.getByTestId('note-form-submit'));

    expect(await screen.findByTestId('note-detail-tag-ideas')).toBeTruthy();
    expect(requests('PATCH').map((call) => call.body)).toEqual([{ tags: ['ideas'] }]);
    expect(screen.queryByTestId('note-detail-tag-budget')).toBeNull();
  });

  it('saves an untouched edit form as an empty patch', async () => {
    const note = makeNote();
    serve(({ method, path }) => (path === '/notes/n1' && method !== 'DELETE' ? jsonResponse(200, note) : undefined));
    renderAt('/notes/n1/edit');
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    await screen.findByTestId('note-detail-title');
    expect(requests('PATCH').map((call) => call.body)).toEqual([{}]);
  });

  it('shows not-found when the note was deleted elsewhere before the save', async () => {
    serve(({ method, path }) => {
      if (path !== '/notes/n1') return undefined;
      if (method === 'GET') return jsonResponse(200, makeNote());
      return method === 'PATCH' ? notFoundResponse() : undefined;
    });
    renderAt('/notes/n1/edit');
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
    expect(screen.queryByTestId('note-form-error')).toBeNull();
    expect(screen.queryByTestId('note-form-title')).toBeNull();
    expect(requests('PATCH')).toHaveLength(1);
  });

  it('keeps a 404 from a create in the form error', async () => {
    serve(({ method }) => (method === 'POST' ? notFoundResponse() : undefined));
    renderAt('/notes/new');
    fireEvent.click(await screen.findByTestId('note-form-submit'));
    const error = await screen.findByTestId('note-form-error');
    expect(error.getAttribute('data-error-code')).toBe('NOT_FOUND');
    expect(screen.queryByTestId('app-not-found')).toBeNull();
  });

  it('shows edit and delete to the owner, and delete goes back to the list', async () => {
    let deleted = false;
    serve(({ method, path }) => {
      if (path === '/notes/n1' && method === 'GET') return deleted ? notFoundResponse() : jsonResponse(200, makeNote());
      if (path === '/notes/n1' && method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (path.startsWith('/notes?')) return listResponse([]);
      return undefined;
    });
    renderAt('/notes/n1');
    expect((await screen.findByTestId('note-detail-edit')).getAttribute('href')).toBe('/notes/n1/edit');
    fireEvent.click(screen.getByTestId('note-detail-delete'));
    expect(await screen.findByTestId('notes-empty')).toBeTruthy();
    expect(requests('DELETE')).toHaveLength(1);
  });

  it('shows not-found when the note was deleted elsewhere before the delete', async () => {
    serve(({ method, path }) => {
      if (path !== '/notes/n1') return undefined;
      return method === 'DELETE' ? notFoundResponse() : jsonResponse(200, makeNote());
    });
    renderAt('/notes/n1');
    fireEvent.click(await screen.findByTestId('note-detail-delete'));
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
  });

  it('hides the owner controls from a non-owner and forbids the edit page', async () => {
    const note = makeNote({ ownerId: 'someone-else' });
    serve(({ method, path }) => (path === '/notes/n1' && method === 'GET' ? jsonResponse(200, note) : undefined));
    renderAt('/notes/n1');
    expect((await screen.findByTestId('note-detail-title')).textContent).toBe('Q3 planning');
    expect(screen.queryByTestId('note-detail-edit')).toBeNull();
    expect(screen.queryByTestId('note-detail-delete')).toBeNull();
    cleanup();

    renderAt('/notes/n1/edit');
    expect(await screen.findByTestId('app-forbidden')).toBeTruthy();
    expect(screen.queryByTestId('note-form-title')).toBeNull();
  });
});
