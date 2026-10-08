import { z } from "zod";

import { requiredText } from "@/lib/validations/fields";

/**
 * Note validation (DESIGN.md §3, §6, §7 Phase 3).
 *
 * **One model, as decided (§9).** There is no `Application.notes` column — the
 * design considered both and kept only the entity, so a note is always a row. That
 * is what lets notes be added, edited and deleted individually, carry their own
 * timestamps, and be searched uniformly: `searchClause` in `queries/applications`
 * already searches `notes.some.content`, which has been live since Phase 2 and
 * until now could never match anything.
 *
 * The simplest schema in the app: one required field. Everything a note needs is
 * `content`, and the dates are the database's.
 */

/**
 * `@db.Text` in the schema, so this is a product cap rather than a column limit —
 * and the most generous in the app, deliberately. A note is the field people paste
 * a whole job description, an email thread or a set of interview questions into,
 * which is exactly what a timeline entry's 2,000 is too small for. The job
 * description's own cap is 50,000 (§8) and this matches it.
 */
const NOTE_CONTENT_MAX = 50_000;

export const noteSchema = z.object({
  content: requiredText("Note", NOTE_CONTENT_MAX),
});

/** Serves the form, `POST /api/applications/:id/notes` and `PATCH /api/notes/:id`. */
export type NoteFormValues = z.input<typeof noteSchema>;

export type NotePayload = z.output<typeof noteSchema>;
