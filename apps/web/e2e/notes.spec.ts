import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TOKEN_KEY = 'auth.token';

interface NoteJson {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

/** Registers a user through the API (via the web server's /api proxy) and returns its token. */
async function registerViaApi(request: APIRequestContext, name = 'Api User') {
  const email = uniqueEmail('e2e-notes');
  const password = 'correct-horse-battery';
  const response = await request.post('/api/v1/auth/register', { data: { email, password, name } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { token: string };
  return { email, password, name, token: body.token };
}

async function signInWithToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [TOKEN_KEY, token] as const,
  );
}

async function createNoteViaApi(
  request: APIRequestContext,
  token: string,
  data: { title: string; body?: string; tags?: string[] },
): Promise<NoteJson> {
  const response = await request.post('/api/v1/notes', { data, headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(201);
  return (await response.json()) as NoteJson;
}

test('creates a note through the form and lands on its detail page', async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  await signInWithToken(page, lena.token);

  await page.goto('/');
  await page.getByTestId('nav-notes').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByTestId('notes-empty')).toBeVisible();
  await page.getByTestId('notes-new').click();
  await expect(page).toHaveURL(/\/notes\/new$/);

  await page.getByTestId('note-form-title').fill('  Sprint planning ');
  await page.getByTestId('note-form-body').fill('Agenda:\n- scope\n- risks');
  await page.getByTestId('note-form-tags').fill('Meeting, work, , meeting');
  await page.getByTestId('note-form-submit').click();

  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('note-detail-title')).toHaveText('Sprint planning');
  await expect(page.getByTestId('note-detail-body')).toHaveText('Agenda:\n- scope\n- risks');
  await expect(page.getByTestId('note-detail-tag-meeting')).toHaveText('meeting');
  await expect(page.getByTestId('note-detail-tag-work')).toHaveText('work');
  await expect(page.getByTestId('note-detail-edit')).toBeVisible();
  await expect(page.getByTestId('note-detail-delete')).toBeVisible();
});

test('the list shows the notes in API order, and a row links to the detail page', async ({ page, request }) => {
  const sam = await registerViaApi(request, 'Sam');
  const older = await createNoteViaApi(request, sam.token, { title: 'Older', tags: ['b', 'a'] });
  const newer = await createNoteViaApi(request, sam.token, { title: 'Newer' });
  await signInWithToken(page, sam.token);

  await page.goto('/notes');
  // NOTE-6: updatedAt descending, ties (same millisecond) broken by id ascending.
  const expected = [older, newer].sort((a, b) =>
    a.updatedAt !== b.updatedAt ? (a.updatedAt < b.updatedAt ? 1 : -1) : a.id < b.id ? -1 : 1,
  );
  const rows = page.getByTestId(/^notes-row-/);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `notes-row-${expected[0]?.id ?? ''}`);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `notes-row-${expected[1]?.id ?? ''}`);
  await expect(page.getByTestId(`notes-title-${older.id}`)).toHaveText('Older');
  await expect(page.getByTestId(`notes-tags-${older.id}`)).toContainText('a');
  await expect(page.getByTestId(`notes-tags-${older.id}`)).toContainText('b');
  await expect(page.getByTestId('notes-empty')).toHaveCount(0);

  await page.getByTestId(`notes-row-${older.id}`).locator('a[href]').first().click();
  await expect(page).toHaveURL(new RegExp(`/notes/${older.id}$`));
  await expect(page.getByTestId('note-detail-title')).toHaveText('Older');
});

test('edits a note through the prefilled form', async ({ page, request }) => {
  const kim = await registerViaApi(request, 'Kim');
  const note = await createNoteViaApi(request, kim.token, { title: 'Draft', body: 'First line\nSecond', tags: ['x', 'y'] });
  await signInWithToken(page, kim.token);

  await page.goto(`/notes/${note.id}`);
  await page.getByTestId('note-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}/edit$`));
  await expect(page.getByTestId('note-form-title')).toHaveValue('Draft');
  await expect(page.getByTestId('note-form-body')).toHaveValue('First line\nSecond');
  await expect(page.getByTestId('note-form-tags')).toHaveValue('x, y');

  await page.getByTestId('note-form-title').fill('Final');
  await page.getByTestId('note-form-tags').fill('z');
  await page.getByTestId('note-form-submit').click();

  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
  await expect(page.getByTestId('note-detail-title')).toHaveText('Final');
  await expect(page.getByTestId('note-detail-body')).toHaveText('First line\nSecond');
  await expect(page.getByTestId('note-detail-tag-z')).toBeVisible();
  await expect(page.getByTestId('note-detail-tag-x')).toHaveCount(0);
});

test('deletes a note at once and returns to the list', async ({ page, request }) => {
  const ivo = await registerViaApi(request, 'Ivo');
  const keep = await createNoteViaApi(request, ivo.token, { title: 'Keep' });
  const gone = await createNoteViaApi(request, ivo.token, { title: 'Remove me' });
  await signInWithToken(page, ivo.token);

  await page.goto(`/notes/${gone.id}`);
  await page.getByTestId('note-detail-delete').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByTestId(`notes-row-${keep.id}`)).toBeVisible();
  await expect(page.getByTestId(`notes-row-${gone.id}`)).toHaveCount(0);

  await page.goto(`/notes/${gone.id}`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
});

test("another user's note and a malformed id render app-not-found", async ({ page, request }) => {
  const lena = await registerViaApi(request, 'Lena');
  const sam = await registerViaApi(request, 'Sam');
  const note = await createNoteViaApi(request, lena.token, { title: 'Private' });
  await signInWithToken(page, sam.token);

  await page.goto(`/notes/${note.id}`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await expect(page.getByTestId('nav-notes')).toBeVisible();
  await page.goto(`/notes/${note.id}/edit`);
  await expect(page.getByTestId('app-not-found')).toBeVisible();
  await page.goto('/notes/abc');
  await expect(page.getByTestId('app-not-found')).toBeVisible();

  await page.goto('/notes');
  await expect(page.getByTestId('notes-empty')).toBeVisible();
});

test('shows VALIDATION_FAILED for an empty title and a bad tag', async ({ page, request }) => {
  const kim = await registerViaApi(request, 'Kim');
  await signInWithToken(page, kim.token);

  await page.goto('/notes/new');
  await expect(page.getByTestId('note-form-error')).toHaveCount(0);
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-form-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');

  await page.getByTestId('note-form-title').fill('Valid title');
  await page.getByTestId('note-form-tags').fill('ok, Bad Tag');
  await page.getByTestId('note-form-submit').click();
  await expect(page.getByTestId('note-form-error')).toHaveAttribute('data-error-code', 'VALIDATION_FAILED');
  await expect(page).toHaveURL(/\/notes\/new$/);
});
