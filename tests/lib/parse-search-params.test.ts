import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/responses";

/**
 * The query-string half of the validation contract. Every filtered list
 * endpoint in §6 goes through this, so the shapes it produces are worth
 * pinning down before the application table depends on them.
 */

/** How a repeatable filter has to be written: the wire cannot tell one from a list. */
const listOfStatus = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]));

const schema = z.object({
  q: z.string().optional(),
  status: listOfStatus,
  page: z.coerce.number().int().min(1).default(1),
});

function parse(queryString: string) {
  return parseSearchParams(new URLSearchParams(queryString), schema);
}

describe("parseSearchParams", () => {
  it("reads a single value as a string", () => {
    expect(parse("q=google").q).toBe("google");
  });

  it("collects a repeated key into an array", () => {
    expect(parse("status=APPLIED&status=OFFER").status).toEqual(["APPLIED", "OFFER"]);
  });

  it("gives a once-present repeatable key to a schema that accepts both shapes", () => {
    expect(parse("status=APPLIED").status).toEqual(["APPLIED"]);
  });

  it("drops empty values so defaults and optionals still apply", () => {
    // "?q=&page=" is what a form submits when its fields are untouched, and it
    // must mean the same thing as sending nothing at all.
    expect(parse("q=&page=")).toEqual({ status: [], page: 1 });
  });

  it("applies defaults when a key is absent", () => {
    expect(parse("").page).toBe(1);
  });

  it("coerces numbers from their string form", () => {
    expect(parse("page=3").page).toBe(3);
  });

  it("throws a 400-shaped error with the offending field named", () => {
    try {
      parse("page=0");
      expect.unreachable("expected a validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).fields).toHaveProperty("page");
    }
  });
});
