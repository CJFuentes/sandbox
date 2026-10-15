import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TOKEN_KEY = 'auth.token';
const NOTE_URL = /\/notes\/[0-9a-f-]{36}$/;

interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; details?: { path: string }[] };
}

/** Registers a fresh user through the API (via the web server's /api proxy) and returns its token. */
async function registerViaApi(request: APIRequestContext, name: string) {
  const email = `e2e-notes-${randomUUID()}@example.test`;
  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: 'correct-horse-battery', name },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { token: string; user: { id: string } };
  return { email, token: body.token, id: body.user.id };
}

async function signInWithToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [TOKEN_KEY, token] as const,
  );
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createNoteViaApi(
  request: APIRequestContext,
  token: string,
  data: { title: string; body?: string; tags?: string[] },
): Promise<Note> {
  const response = await request.post('/api/v1/notes', { headers: auth(token), data });
  expect(response.status()).toBe(201);
  return (await response.json()) as Note;
}

async function getNoteViaApi(request: APIRequestContext, token: string, noteId: string): Promise<Note> {
  const response = await request.get(`/api/v1/notes/${noteId}`, { headers: auth(token) });
  expect(response.status()).toBe(200);
  return (await response.json()) as Note;
}

async function expectNotFound(response: { status(): number; json(): Promise<unknown> }): Promise<void> {
  expect(response.status()).toBe(404);
  expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_FOUND');
}

async function expectValidation(
  response: { status(): number; json(): Promise<unknown> },
  path: string,
): Promise<void> {
  expect(response.status()).toBe(400);
  const body = (await response.json()) as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_FAILED');
  expect(body.error.details?.map((detail) => detail.path)).toContain(path);
}

/** The test ids of the note rows on /notes, in page order. */
async function rowIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="notes-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''));
}

/** Clicks the note form's submit button and waits for the PATCH response and the note's page. */
async function submitEdit(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/v1/notes/') && response.request().method() === 'PATCH',
    ),
    page.getByTestId('note-form-submit').click(),
  ]);
  await expect(page).toHaveURL(NOTE_URL);
}

test('AC1: creates a note with tags from the notes page', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  await signInWithToken(page, lena.token);

  await page.goto('/');
  await page.getByTestId('nav-notes').click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.getByTestId('notes-new').click();
  await expect(page).toHaveURL(/\/notes\/new$/);

  await page.getByTestId('note-form-title').fill('Q3 planning');
  await page.getByTestId('note-form-body').fill('Hiring and budget');
  await page.getByTestId('note-form-tags').fill('Planning, budget, planning');
  await page.getByTestId('note-form-submit').click();

  await expect(page).toHaveURL(NOTE_URL);
  const noteId = new URL(page.url()).pathname.split('/').pop() ?? '';
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');
  await expect(page.getByTestId('note-detail-body')).toHaveText('Hiring and budget');
  await expect(page.getByTestId('note-detail-tag-budget')).toBeVisible();
  await expect(page.getByTestId('note-detail-tag-planning')).toBeVisible();
  await expect(page.locator('[data-testid^="note-detail-tag-"]')).toHaveCount(2);

  await page.getByTestId('nav-notes').click();
  await expect(page.getByTestId(`notes-title-${noteId}`)).toHaveText('Q3 planning');
  const href = await page.getByTestId(`notes-row-${noteId}`).locator('a').first().getAttribute('href');
  expect(href).toBe(`/notes/${noteId}`);
});

test("AC2: notes are private to their owner", async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const sam = await registerViaApi(request, 'Sam');
  const note = await createNoteViaApi(request, lena.token, { title: 'Q3 planning' });

  await expectNotFound(await request.get(`/api/v1/notes/${note.id}`, { headers: auth(sam.token) }));
  await expectNotFound(
    await request.patch(`/api/v1/notes/${note.id}`, { headers: auth(sam.token), data: { title: 'Mine' } }),
  );
  await expectNotFound(await request.delete(`/api/v1/notes/${note.id}`, { headers: auth(sam.token) }));

  const list = await request.get('/api/v1/notes', { headers: auth(sam.token) });
  expect(list.status()).toBe(200);
  const items = ((await list.json()) as { items: Note[] }).items;
  expect(items.map((item) => item.id)).not.toContain(note.id);

  expect((await getNoteViaApi(request, lena.token, note.id)).title).toBe('Q3 planning');

  await signInWithToken(page, sam.token);
  await page.goto(`/notes/${note.id}`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await page.goto('/notes');
  await expect(page.getByTestId('notes-empty')).toBeVisible();
  await expect(page.getByTestId(`notes-row-${note.id}`)).toHaveCount(0);
});

test('AC3: the most recently updated note comes first; an unchanged save keeps the order', async ({
  page,
  request,
}) => {
  const lena = await registerViaApi(request, 'Lena');
  const retro = await createNoteViaApi(request, lena.token, { title: 'Retro notes' });
  const q3 = await createNoteViaApi(request, lena.token, { title: 'Q3 planning', tags: ['budget', 'planning'] });
  await signInWithToken(page, lena.token);

  await page.goto(`/notes/${retro.id}/edit`);
  await expect(page.getByTestId('note-form-title')).toHaveValue('Retro notes');
  await page.getByTestId('note-form-title').fill('Retro notes (final)');
  await submitEdit(page);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Retro notes (final)');

  await page.goto('/notes');
  await expect(page.getByTestId(`notes-row-${retro.id}`)).toBeVisible();
  await expect(page.getByTestId(`notes-row-${q3.id}`)).toBeVisible();
  await expect(page.getByTestId(`notes-title-${retro.id}`)).toHaveText('Retro notes (final)');
  const orderAfterRename = await rowIds(page);
  expect(orderAfterRename.indexOf(`notes-row-${retro.id}`)).toBeLessThan(
    orderAfterRename.indexOf(`notes-row-${q3.id}`),
  );

  const before = await getNoteViaApi(request, lena.token, q3.id);
  await page.goto(`/notes/${q3.id}/edit`);
  await expect(page.getByTestId('note-form-title')).toHaveValue('Q3 planning');
  await submitEdit(page);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');

  const after = await getNoteViaApi(request, lena.token, q3.id);
  expect(after.updatedAt).toBe(before.updatedAt);

  await page.goto('/notes');
  await expect(page.getByTestId(`notes-row-${retro.id}`)).toBeVisible();
  await expect(page.getByTestId(`notes-row-${q3.id}`)).toBeVisible();
  expect(await rowIds(page)).toEqual(orderAfterRename);
});

test('AC4: edits the tags and deletes the note', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const note = await createNoteViaApi(request, lena.token, {
    title: 'Q3 planning',
    body: 'Hiring and budget',
    tags: ['budget', 'planning'],
  });
  await signInWithToken(page, lena.token);

  await page.goto(`/notes/${note.id}`);
  await page.getByTestId('note-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}/edit$`));
  await expect(page.getByTestId('note-form-tags')).toHaveValue('budget, planning');
  await expect(page.getByTestId('note-form-body')).toHaveValue('Hiring and budget');
  await page.getByTestId('note-form-tags').fill('ideas');
  await submitEdit(page);

  await expect(page.getByTestId('note-detail-tag-ideas')).toBeVisible();
  await expect(page.locator('[data-testid^="note-detail-tag-"]')).toHaveCount(1);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Q3 planning');

  await page.getByTestId('note-detail-delete').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByTestId('notes-empty')).toBeVisible();
  await expect(page.getByTestId(`notes-row-${note.id}`)).toHaveCount(0);

  await expectNotFound(await request.get(`/api/v1/notes/${note.id}`, { headers: auth(lena.token) }));
});

test('AC5: invalid notes are rejected', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  await signInWithToken(page, lena.token);

  await page.goto('/notes/new');
  await expect(page.getByTestId('note-form-error')).toHaveCount(0);
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-form-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
  await expect(page).toHaveURL(/\/notes\/new$/);

  const post = (data: unknown) => request.post('/api/v1/notes', { headers: auth(lena.token), data });
  await expectValidation(await post({ title: '' }), 'title');
  await expectValidation(await post({ title: 'Ideas', tags: ['ok', 'road map'] }), 'tags.1');
  const eleven = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
  await expectValidation(await post({ title: 'Ideas', tags: eleven }), 'tags');
  await expectValidation(await post({ title: 'Ideas', body: null }), 'body');
});

test('AC6: the body is kept exactly as written', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const body = '  Standup notes\nBlocked on review\n';
  const note = await createNoteViaApi(request, lena.token, { title: '  Standup  ', body });
  expect(note.title).toBe('Standup');
  expect(note.body).toBe(body);

  await signInWithToken(page, lena.token);
  await page.goto(`/notes/${note.id}`);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Standup');
  expect((await page.getByTestId('note-detail-body').textContent())?.trim()).toBe(body.trim());

  await page.getByTestId('note-detail-edit').click();
  await expect(page.getByTestId('note-form-body')).toHaveValue(body);
});

test('AC3/AC6: saving an untouched edit form keeps a CRLF body and its update time', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const body = '  Agenda\r\n- hiring\r\n';
  const note = await createNoteViaApi(request, lena.token, { title: 'Standup', body, tags: ['ideas'] });
  expect(note.body).toBe(body);
  await signInWithToken(page, lena.token);

  await page.goto(`/notes/${note.id}/edit`);
  await expect(page.getByTestId('note-form-title')).toHaveValue('Standup');
  await submitEdit(page);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Standup');

  const after = await getNoteViaApi(request, lena.token, note.id);
  expect(after.body).toBe(body);
  expect(after.updatedAt).toBe(note.updatedAt);
});
