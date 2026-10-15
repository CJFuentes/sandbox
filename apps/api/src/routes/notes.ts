// Personal notes (issue #96, rules NOTE-1 to NOTE-6).
import { createNoteBodySchema, updateNoteBodySchema, type ListResponse, type Note } from '@app/shared';
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

/**
 * NOTE-4: the condition for a note the caller can see. Own notes only for now; shared notes (C02)
 * widen this condition, and mutations still go through `requireOwner()`.
 */
export function visibleNoteWhere(noteId: string, userId: string): SQL {
  return and(idEquals(notes.id, noteId), eq(notes.ownerId, userId)) ?? sql`false`;
}

/** NOTE-5: only the owner edits or deletes. A caller who can see the note but does not own it gets 403 (§1.7). */
export function requireOwner(note: NoteRow, userId: string): void {
  if (note.ownerId !== userId) throw forbidden();
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

export const notesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/notes', async (request, reply): Promise<Note> => {
    const user = requireUser(request);
    const body = parseBody(createNoteBodySchema, request.body);
    const [row] = await app.db
      .insert(notes)
      .values({ ownerId: user.id, title: body.title, body: body.body, tags: body.tags })
      .returning();
    if (row === undefined) throw new Error('insert returned no row');
    void reply.status(201);
    return toNote(row);
  });

  app.get('/notes', async (request): Promise<ListResponse<Note>> => {
    const user = requireUser(request);
    const page = parseQuery(paginationQuery, request.query);
    const where = eq(notes.ownerId, user.id);
    const rows = await app.db
      .select()
      .from(notes)
      .where(where)
      .orderBy(desc(notes.updatedAt), asc(notes.id))
      .limit(page.limit)
      .offset(page.offset);
    const [totalRow] = await app.db.select({ total: count() }).from(notes).where(where);
    return listResponse(rows.map(toNote), totalRow?.total ?? 0, page);
  });

  app.get<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const user = requireUser(request);
    const [row] = await app.db
      .select()
      .from(notes)
      .where(visibleNoteWhere(request.params.noteId, user.id))
      .limit(1);
    if (row === undefined) throw notFound();
    return toNote(row);
  });

  // Order: 400 (body), then 404 (visibility), then 403 (ownership).
  app.patch<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const user = requireUser(request);
    const body = parseBody(updateNoteBodySchema, request.body);
    return app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(notes)
        .where(visibleNoteWhere(request.params.noteId, user.id))
        .for('update');
      if (current === undefined) throw notFound();
      requireOwner(current, user.id);

      const patch: Partial<Pick<NoteRow, 'title' | 'body' | 'tags'>> = {};
      if (body.title !== undefined && body.title !== current.title) patch.title = body.title;
      if (body.body !== undefined && body.body !== current.body) patch.body = body.body;
      if (body.tags !== undefined && !sameTags(body.tags, current.tags)) patch.tags = body.tags;
      // NOTE-5: updatedAt changes only when a stored value changes.
      if (Object.keys(patch).length === 0) return toNote(current);

      const [row] = await tx
        .update(notes)
        .set({
          ...patch,
          // Strictly later than the previous value, even within the same millisecond.
          updatedAt: sql`greatest(now(), ${notes.updatedAt} + interval '1 millisecond')`,
        })
        .where(eq(notes.id, current.id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');
      return toNote(row);
    });
  });

  // Order: 404 (visibility), then 403 (ownership).
  app.delete<{ Params: NoteParams }>('/notes/:noteId', async (request, reply) => {
    const user = requireUser(request);
    await app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(notes)
        .where(visibleNoteWhere(request.params.noteId, user.id))
        .for('update');
      if (current === undefined) throw notFound();
      requireOwner(current, user.id);
      await tx.delete(notes).where(eq(notes.id, current.id));
    });
    return reply.status(204).send();
  });
};
