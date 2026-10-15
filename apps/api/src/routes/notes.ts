// Notes (issue #94): personal notes with tags. Visibility is visibleTo() (C02 widens it); edit
// rights are canEditNote() from @app/shared; every write is stamped with writeStamp().
import {
  canEditNote,
  createNoteBodySchema,
  updateNoteBodySchema,
  type ListResponse,
  type Note,
  type UpdateNoteInput,
} from '@app/shared';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { notes, type NoteRow } from '../db/schema';
import { requireUser } from '../lib/auth';
import { forbidden, notFound } from '../lib/errors';
import { idEquals } from '../lib/ids';
import { listResponse, paginationQuery } from '../lib/pagination';
import { parseBody, parseQuery } from '../lib/validation';

interface NoteParams {
  noteId: string;
}

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    body: row.body,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Notes `userId` may read (NOTE-4). C02 widens this to shared notes (use EXISTS, not a JOIN). */
export function visibleTo(userId: string): SQL {
  return eq(notes.ownerId, userId);
}

/**
 * The owner's next write time (D3): when the statement started, but at least 1 ms after the
 * latest updated_at among the owner's notes. An owner's sequential writes therefore get strictly
 * increasing millisecond stamps, so NOTE-6 ordering never depends on a same-millisecond tie, and a
 * write that waited on a row lock can never be stamped earlier than the write it waited for.
 * statement_timestamp() is constant within a statement, so INSERT's created_at === updated_at.
 * GREATEST ignores the NULL max of an owner with no notes.
 */
export function writeStamp(ownerId: string): SQL {
  return sql`greatest(statement_timestamp(), (select max(prior.updated_at) from notes as prior where prior.owner_id = ${ownerId}) + interval '1 millisecond')`;
}

export type NoteChanges = Partial<Pick<NoteRow, 'title' | 'body' | 'tags'>>;

/** Only the properties whose stored value would change (NOTE-5). Empty means no write. */
export function noteChanges(current: Pick<NoteRow, 'title' | 'body' | 'tags'>, input: UpdateNoteInput): NoteChanges {
  const changes: NoteChanges = {};
  if (input.title !== undefined && input.title !== current.title) changes.title = input.title;
  if (input.body !== undefined && input.body !== current.body) changes.body = input.body;
  if (input.tags !== undefined && !sameList(input.tags, current.tags)) changes.tags = input.tags;
  return changes;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.post('/notes', async (request, reply): Promise<Note> => {
    const { id: userId } = requireUser(request);
    const input = parseBody(createNoteBodySchema, request.body);
    const [row] = await app.db
      .insert(notes)
      .values({
        ownerId: userId,
        title: input.title,
        body: input.body,
        tags: input.tags,
        createdAt: writeStamp(userId),
        updatedAt: writeStamp(userId),
      })
      .returning();
    if (row === undefined) throw new Error('insert returned no row');
    void reply.status(201);
    return toNote(row);
  });

  app.get('/notes', async (request): Promise<ListResponse<Note>> => {
    const { id: userId } = requireUser(request);
    const page = parseQuery(paginationQuery, request.query);
    const where = visibleTo(userId);
    const rows = await app.db
      .select()
      .from(notes)
      .where(where)
      .orderBy(desc(notes.updatedAt), asc(notes.id))
      .limit(page.limit)
      .offset(page.offset);
    const [counted] = await app.db.select({ total: count() }).from(notes).where(where);
    return listResponse(rows.map(toNote), counted?.total ?? 0, page);
  });

  app.get<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const { id: userId } = requireUser(request);
    const [row] = await app.db
      .select()
      .from(notes)
      .where(and(idEquals(notes.id, request.params.noteId), visibleTo(userId)))
      .limit(1);
    if (row === undefined) throw notFound();
    return toNote(row);
  });

  app.patch<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const { id: userId } = requireUser(request);
    const input = parseBody(updateNoteBodySchema, request.body); // 400 before any DB access (D6)
    const row = await app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(notes)
        .where(and(idEquals(notes.id, request.params.noteId), visibleTo(userId)))
        .for('update', { of: notes });
      if (current === undefined) throw notFound();
      if (!canEditNote(current, userId)) throw forbidden();
      const changes = noteChanges(current, input);
      if (Object.keys(changes).length === 0) return current; // no write: updatedAt unchanged (NOTE-5)
      const [updated] = await tx
        .update(notes)
        .set({ ...changes, updatedAt: writeStamp(current.ownerId) })
        .where(eq(notes.id, current.id))
        .returning();
      if (updated === undefined) throw new Error('update returned no row');
      return updated;
    });
    return toNote(row);
  });

  app.delete<{ Params: NoteParams }>('/notes/:noteId', async (request, reply) => {
    const { id: userId } = requireUser(request);
    await app.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: notes.id, ownerId: notes.ownerId })
        .from(notes)
        .where(and(idEquals(notes.id, request.params.noteId), visibleTo(userId)))
        .for('update', { of: notes });
      if (current === undefined) throw notFound();
      if (!canEditNote(current, userId)) throw forbidden();
      await tx.delete(notes).where(eq(notes.id, current.id));
    });
    return reply.status(204).send();
  });
};
