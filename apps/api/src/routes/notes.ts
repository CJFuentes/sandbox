// Personal notes (issue #98): NOTE-1 to NOTE-6. Every route is owner-only; any other note is 404.
import { createNoteBodySchema, updateNoteBodySchema, type ListResponse, type Note } from '@app/shared';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { notes, type NoteRow } from '../db/schema';
import { requireUser } from '../lib/auth';
import { notFound } from '../lib/errors';
import { idEquals } from '../lib/ids';
import { listResponse, paginationQuery } from '../lib/pagination';
import { parseBody, parseQuery } from '../lib/validation';

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    body: row.body,
    tags: [...row.tags],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** NOTE-4: the caller sees only their own notes; a malformed id matches nothing. */
function ownNote(noteId: string, userId: string) {
  return and(idEquals(notes.id, noteId), eq(notes.ownerId, userId));
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

interface NoteParams {
  noteId: string;
}

export const notesRoutes: FastifyPluginAsync = async (app) => {
  // POST /notes -> 201 Note
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

  // GET /notes?limit&offset -> list envelope, updatedAt desc, id asc (NOTE-6)
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
    const [totals] = await app.db.select({ total: count() }).from(notes).where(where);
    return listResponse(rows.map(toNote), totals?.total ?? 0, page);
  });

  // GET /notes/:noteId -> 200 Note | 404
  app.get<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const user = requireUser(request);
    const [row] = await app.db
      .select()
      .from(notes)
      .where(ownNote(request.params.noteId, user.id))
      .limit(1);
    if (row === undefined) throw notFound();
    return toNote(row);
  });

  // PATCH /notes/:noteId -> 200 Note | 400 | 404
  app.patch<{ Params: NoteParams }>('/notes/:noteId', async (request): Promise<Note> => {
    const user = requireUser(request);
    const body = parseBody(updateNoteBodySchema, request.body); // 400 before the lookup
    return app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(notes)
        .where(ownNote(request.params.noteId, user.id))
        .limit(1)
        .for('update');
      if (current === undefined) throw notFound();
      const next = {
        title: body.title ?? current.title,
        body: body.body ?? current.body,
        tags: body.tags ?? current.tags,
      };
      const changed =
        next.title !== current.title || next.body !== current.body || !sameTags(next.tags, current.tags);
      if (!changed) return toNote(current); // NOTE-5: no write, updatedAt untouched
      const [row] = await tx
        .update(notes)
        .set({
          ...next,
          // Evaluated after the row lock is held (clock_timestamp, not the transaction-start now()), and strictly
          // greater than the previous value even at millisecond precision or if the clock steps back.
          updatedAt: sql`greatest(clock_timestamp(), ${notes.updatedAt} + interval '1 millisecond')`,
        })
        .where(eq(notes.id, current.id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');
      return toNote(row);
    });
  });

  // DELETE /notes/:noteId -> 204 | 404
  app.delete<{ Params: NoteParams }>('/notes/:noteId', async (request, reply) => {
    const user = requireUser(request);
    const deleted = await app.db
      .delete(notes)
      .where(ownNote(request.params.noteId, user.id))
      .returning({ id: notes.id });
    if (deleted.length === 0) throw notFound();
    return reply.status(204).send();
  });
};
