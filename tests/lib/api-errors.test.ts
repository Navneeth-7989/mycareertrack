import { describe, expect, it } from "vitest";

import {
  ConfirmationRequiredError,
  ConflictError,
  NotFoundError,
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
