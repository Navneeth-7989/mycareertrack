import { describe, expect, it } from "vitest";

import {
  ConfirmationRequiredError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  handleRouteError,
} from "@/lib/api/errors";
import { readApiError } from "@/lib/api/read-error";

/**
 * The error contract from DESIGN.md §6, tested from both ends — the handler
 * writes the body and `readApiError` reads it, and a change to one that breaks
 * the other is otherwise invisible until a form stops showing its errors.
 */

async function roundTrip(error: unknown) {
  const response = handleRouteError(error);

  return { status: response.status, parsed: await readApiError(response.clone()) };
}

describe("handleRouteError", () => {
  it("maps a validation error to a 400 with its fields", async () => {
    const { status, parsed } = await roundTrip(new ValidationError({ jobTitle: "Required" }));

    expect(status).toBe(400);
    expect(parsed.code).toBe("VALIDATION_ERROR");
    expect(parsed.fields).toEqual({ jobTitle: "Required" });
  });

  it("maps not-found to a 404", async () => {
    const { status, parsed } = await roundTrip(new NotFoundError());

    expect(status).toBe(404);
    expect(parsed.code).toBe("NOT_FOUND");
  });

  it("maps a Prisma unique violation to a 409 without leaking the message", async () => {
    // Duck-typed exactly as the handler expects. The real error text names
    // tables and constraints, and none of it may reach a response (§8).
    const prismaError = Object.assign(new Error("Unique constraint failed on Company_name_key"), {
      code: "P2002",
    });

    const { status, parsed } = await roundTrip(prismaError);

    expect(status).toBe(409);
    expect(parsed.message).toBe("That record already exists");
    expect(parsed.message).not.toContain("Company_name_key");
  });

  it("reports an unknown error as a generic 500", async () => {
    const { status, parsed } = await roundTrip(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    expect(status).toBe(500);
    expect(parsed.message).toBe("Something went wrong. Please try again.");
    expect(parsed.message).not.toContain("10.0.0.5");
  });

  /**
   * Added by the Phase 5 error-shape audit. `services/resume-storage.ts` throws
   * plain `Error`s whose text carries Supabase's own message, the bucket name
   * and the storage path — and a storage path **begins with the owner's user
   * id**. They are plain Errors rather than `AppError`s precisely so this
   * branch handles them, which is correct but entirely implicit: anyone
   * "improving" one of those into a `ConflictError` to get a better status code
   * would publish a user id in a response body. This is the test that would
   * fail if they did.
   */
  it("does not leak a storage error's bucket, path or user id", async () => {
    const storageError = new Error(
      "[storage] could not sign resume url: Object not found in bucket resumes at " +
        "cmush621p000014uy8vwbp0tw/9f1c2b3a-4d5e.pdf",
    );

    const { status, parsed } = await roundTrip(storageError);

    expect(status).toBe(500);
    expect(parsed.message).toBe("Something went wrong. Please try again.");

    const body = JSON.stringify(parsed);

    expect(body).not.toContain("cmush621p000014uy8vwbp0tw");
    expect(body).not.toContain("resumes");
    expect(body).not.toContain(".pdf");
  });

  /**
   * The same guarantee stated as a property rather than per case: the only text
   * that ever reaches a client is text we wrote. An `AppError`'s message is
   * ours by construction; everything else is replaced.
   */
  it("replaces the message of every error it did not author", async () => {
    const foreign = [
      new Error("Invalid `prisma.application.findFirst()` invocation in /var/task/.next/server"),
      Object.assign(new Error("Unique constraint failed on the fields: (`userId`,`email`)"), {
        code: "P2002",
      }),
      Object.assign(new Error("An operation failed because it depends on one or more records"), {
        code: "P2025",
      }),
      "a thrown string",
      { message: "a thrown object" },
      null,
    ];

    for (const error of foreign) {
      const { parsed } = await roundTrip(error);
      const body = JSON.stringify(parsed);

      expect(body).not.toMatch(/prisma|constraint|\/var\/task|userId/i);
    }
  });
});

describe("ConfirmationRequiredError", () => {
  const warning = new ConfirmationRequiredError({
    reason: "POSSIBLE_DUPLICATE",
    message: "You already have an application for SDE Intern at Google",
    relatedIds: ["app-1", "app-2"],
  });

  it("is a 409 carrying the question to put to the user", async () => {
    const { status, parsed } = await roundTrip(warning);

    expect(status).toBe(409);
    expect(parsed.code).toBe("CONFIRMATION_REQUIRED");
    expect(parsed.confirmation?.reason).toBe("POSSIBLE_DUPLICATE");
    expect(parsed.confirmation?.message).toContain("SDE Intern at Google");
    expect(parsed.confirmation?.relatedIds).toEqual(["app-1", "app-2"]);
  });

  it("is distinguishable from a plain conflict", async () => {
    // Both are 409s, and the client has to tell them apart: one is a question
    // it can ask, the other is a dead end. The status code alone cannot.
    const plain = await roundTrip(new ConflictError("That record already exists"));

    expect(plain.status).toBe(409);
    expect(plain.parsed.code).toBe("CONFLICT");
    expect(plain.parsed.confirmation).toBeUndefined();
  });
});

describe("ConflictError", () => {
  /**
   * A regression test for the bug Phase 5 step 3's error-shape audit found: the
   * constructor passed `fields` as the whole options object, so `options.fields`
   * was undefined and a 409's per-field messages vanished between the throw and
   * the response. Nothing passed them yet, which is why nothing looked broken —
   * the first caller to try would have been debugging the form.
   */
  it("carries its field errors through to the response", async () => {
    const { status, parsed } = await roundTrip(
      new ConflictError("A contact with that email already exists", {
        email: "You already have a contact with this email",
      }),
    );

    expect(status).toBe(409);
    expect(parsed.code).toBe("CONFLICT");
    expect(parsed.fields).toEqual({ email: "You already have a contact with this email" });
  });

  it("omits fields when there are none", async () => {
    const { parsed } = await roundTrip(new ConflictError("That record already exists"));

    expect(parsed.fields).toEqual({});
  });
});

describe("RateLimitError", () => {
  it("is a 429 whose Retry-After matches the message", async () => {
    const response = handleRouteError(
      new RateLimitError("Too many searches. Try again in a minute.", 42),
    );
    const parsed = await readApiError(response.clone());

    expect(response.status).toBe(429);
    expect(parsed.code).toBe("RATE_LIMITED");
    expect(parsed.message).toBe("Too many searches. Try again in a minute.");
    // The header is for clients and the sentence is for people; both come from
    // one number, so a client backing off cannot be told something different
    // from what the user was shown.
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  /**
   * The header is only set when there is something to retry after. A stray
   * `Retry-After` on an unrelated error would tell a well-behaved client to
   * back off from a 400 it should fix instead.
   */
  it("is the only error that sets the header", async () => {
    for (const error of [
      new ValidationError({ jobTitle: "Required" }),
      new NotFoundError(),
      new ConflictError("That record already exists"),
      new Error("boom"),
    ]) {
      expect(handleRouteError(error).headers.get("Retry-After")).toBeNull();
    }
  });
});

describe("readApiError", () => {
  it("falls back when the body is not our envelope", async () => {
    const proxyError = new Response("<html>502 Bad Gateway</html>", { status: 502 });

    const parsed = await readApiError(proxyError);

    expect(parsed.code).toBeUndefined();
    expect(parsed.message).toBe("Something went wrong. Please try again.");
    expect(parsed.fields).toEqual({});
  });

  it("falls back on an empty body", async () => {
    const parsed = await readApiError(new Response(null, { status: 500 }));

    expect(parsed.message).toBe("Something went wrong. Please try again.");
  });

  it("omits confirmation when the response is not asking for one", async () => {
    // The form branches on `confirmation` being present, so a stray empty
    // object here would open a dialog with no question in it.
    const { parsed } = await roundTrip(new ValidationError({ jobTitle: "Required" }));

    expect(parsed.confirmation).toBeUndefined();
  });
});
