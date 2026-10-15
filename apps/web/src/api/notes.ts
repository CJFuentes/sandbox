import type { CreateNoteBody, ListResponse, Note, UpdateNoteBody } from '@app/shared';
import { apiRequest } from './client';

const notePath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}`;

export async function listNotes(page: { limit?: number; offset?: number } = {}): Promise<ListResponse<Note>> {
  return (await apiRequest('/notes', { query: page })) as ListResponse<Note>;
}

export async function getNote(noteId: string): Promise<Note> {
  return (await apiRequest(notePath(noteId))) as Note;
}

export async function createNote(body: CreateNoteBody): Promise<Note> {
  return (await apiRequest('/notes', { method: 'POST', body })) as Note;
}

export async function updateNote(noteId: string, body: UpdateNoteBody): Promise<Note> {
  return (await apiRequest(notePath(noteId), { method: 'PATCH', body })) as Note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await apiRequest(notePath(noteId), { method: 'DELETE' });
}
