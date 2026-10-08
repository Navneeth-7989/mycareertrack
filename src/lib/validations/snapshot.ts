import { z } from "zod";

import { isHttpUrl } from "@/lib/validations/url";

/**
 * The field builders every undo snapshot is assembled from (DESIGN.md §8).
 *
 * A snapshot is the one payload in the product that travels **server → browser →
 * server**: a delete returns everything needed to put the row back, the client
 * holds it for the life of the toast, and Undo posts it to the matching
 * `/restore` endpoint. So it is request data on the way back in and is validated
 * exactly like any other request body — nothing in it is trusted.
 *
 * Extracted from `validations/application`, which had the first two of these
 * private to itself, when undo arrived for interviews, assessments and tasks.
 * Four copies of the null-before-coercion rule would be four places for it to
 * drift, and the one that drifts is the one that silently stores 1 January 1970.
 *
 * **`userId` is never a snapshot field** — in any of them. Identity comes from
 * the session on the way back in (§4, rule 3), so a hand-crafted snapshot cannot
 * plant a row in someone else's account. Every restore separately re-checks the
 * foreign keys it was handed.
 */

/**
 * A date that has been through `JSON.stringify` and is now an ISO string — or is
 * still a `Date`, when the snapshot never left the server. `z.coerce.date()`
 * accepts both and rejects anything that is not a real date.
 */
export const wireDate = z.coerce.date();

/**
 * The nullable form, written as a union so the null branch is matched *before*
 * coercion is ever attempted.
 *
 * The hazard it guards against is real and silent: `z.coerce.date()` on its own
 * turns `null` into `new Date(null)`, which is the epoch rather than an error —
 * verified, not assumed. A nullable `appliedAt` reaching a bare coercion would
 * come back as 1 January 1970, and that date counts as a submitted application
 * in every rate in §3. `.nullable()` happens to short-circuit the same way; the
 * union says so in the shape rather than relying on a wrapper's ordering.
 */
export const nullableWireDate = z.union([z.null(), wireDate]);

/**
 * Generous, and a request-size bound rather than a product rule. No real meeting
 * link or job posting is anywhere near this long.
 */
const WIRE_URL_MAX = 2048;

/**
 * A nullable URL column, re-checked against the http/https rule (§8).
 *
 * **This is the one snapshot field where lax validation would be a
 * vulnerability, not just untidy.** Every URL in a snapshot is a value the UI
 * puts straight into an `href` — `meetingUrl` on an interview row, `url` on an
 * assessment, `jobUrl` on the application header — and a snapshot is the only
 * path by which a string that never went through `optionalUrl` could reach one.
 * Without this, posting `{"meetingUrl": "javascript:…"}` to a restore endpoint
 * would store exactly that, and the row would then render it as a link.
 *
 * The scheme check is the same `isHttpUrl` the forms use, so the two paths into
 * these columns cannot disagree. No normalisation: a stored URL has already been
 * through it, and silently rewriting a value during a restore would make undo
 * not-quite-an-undo.
 */
export const nullableWireUrl = z.union([
  z.null(),
  z.string().max(WIRE_URL_MAX).refine(isHttpUrl, { error: "Not a valid link" }),
]);

/**
 * What a delete response looks like to the client, which deliberately does not
 * understand the snapshot it is holding.
 *
 * The client's only decision is whether to *offer* Undo, and "the response
 * carried a snapshot object" is the whole of what it needs to know to make it.
 * The snapshot then goes back to the server verbatim and is parsed there against
 * the real per-entity schema — which is the half that matters, because that is
 * the parse standing between a forged body and the database.
 *
 * Deliberately shallower than `deletedApplicationSchema`, which validates its
 * snapshot in full on the client as well. The difference is worth stating: the
 * stricter version catches a malformed snapshot early and hides the button, this
 * one lets the user click an Undo that then fails with a toast. Three entities
 * paying for three snapshot schemas in the client bundle — plus a registry in a
 * shared component to pick between them — buys only that, and the shape it would
 * be guarding is one the server produced from its own columns a moment earlier.
 */
export const deletedWithSnapshotSchema = z.object({
  data: z.object({ snapshot: z.record(z.string(), z.unknown()) }),
});
