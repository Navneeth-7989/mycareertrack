import type { z } from "zod";

import { ValidationError, type FieldErrors } from "./errors";

/**
 * Success response helpers. Every successful body is wrapped in `data`
 * (DESIGN.md §6) so a response shape never changes depending on whether the
 * payload happens to be an object or an array.
 */

export function ok<T>(data: T): Response {
  return Response.json({ data }, { status: 200 });
}

export function created<T>(data: T): Response {
  return Response.json({ data }, { status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export type Paginated = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function okPaginated<T>(data: T[], meta: Paginated): Response {
  return Response.json({ data, meta }, { status: 200 });
}

/**
 * Parses a request body with a Zod schema, throwing a `ValidationError` that
 * carries per-field messages the forms can render inline.
 *
 * Only the first error per field is kept. A field with three simultaneous
 * complaints has one that the user should fix first, and the form has room for
 * one line of text under the input.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    // A malformed or absent body is the client's mistake, not a server fault,
    // so it is reported the same way a failed field would be.
    throw new ValidationError({}, "Request body must be valid JSON");
  }

  return parseWith(schema, body);
}

/**
 * The query-string counterpart of `parseJsonBody`.
 *
 * `URLSearchParams` is flattened to a plain object first, because Zod cannot
 * read an iterable. A key that appears more than once becomes an array —
 * `?status=APPLIED&status=OFFER` is how the repeatable filters in DESIGN.md §6
 * arrive — while a key that appears once stays a string. Schemas for repeatable
 * parameters therefore have to accept both shapes, since the wire cannot tell a
 * one-item list from a single value.
 */
export function parseSearchParams<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
): z.output<S> {
  const record: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);

    // Absent and present-but-empty are the same answer for a filter, and
    // leaving "" in would defeat every `.optional()` in the schema.
    const meaningful = values.filter((value) => value !== "");

    if (meaningful.length === 1) {
      record[key] = meaningful[0]!;
    } else if (meaningful.length > 1) {
      record[key] = meaningful;
    }
  }

  return parseWith(schema, record);
}

function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const fields: FieldErrors = {};

    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";

      fields[path] ??= issue.message;
    }

    throw new ValidationError(fields);
  }

  return result.data;
}
