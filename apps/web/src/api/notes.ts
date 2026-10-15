import type { CreateNoteBody, ListResponse, Note, UpdateNoteBody } from '@app/shared';
import { apiRequest } from './client';

function notePath(id: string): string {
  return `/notes/${encodeURIComponent(id)}`;
}

export async function listNotes(page: { limit?: number; offset?: number } = {}): Promise<ListResponse<Note>> {
  return (await apiRequest('/notes', { query: page })) as ListResponse<Note>;
}

export async function getNote(id: string): Promise<Note> {
  return (await apiRequest(notePath(id))) as Note;
}

export async function createNote(body: CreateNoteBody): Promise<Note> {
  return (await apiRequest('/notes', { method: 'POST', body })) as Note;
}

/** PATCH: send only the fields to change (`tags` replaces the whole list). */
export async function updateNote(id: string, body: UpdateNoteBody): Promise<Note> {
  return (await apiRequest(notePath(id), { method: 'PATCH', body })) as Note;
}

export async function deleteNote(id: string): Promise<void> {
  await apiRequest(notePath(id), { method: 'DELETE' });
}
