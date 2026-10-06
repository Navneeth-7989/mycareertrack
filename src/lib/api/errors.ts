/**
 * The error vocabulary shared by every Route Handler, and the mapping from an
 * error to a safe response shape (DESIGN.md §4, §6).
 *
 * The contract: a handler throws one of these when it knows what went wrong,
 * and `handleRouteError` turns anything else into a logged 500 with a generic
 * message. A raw Prisma message, a stack trace, or a connection string must
 * never reach a response.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONFIRMATION_REQUIRED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string>;

/**
 * What a `CONFIRMATION_REQUIRED` response carries: enough for the client to
 * ask the question without knowing why it was asked.
 *
 * Kept generic — an id and a message, not an application-shaped payload — so
 * this module stays the shared error vocabulary rather than growing a
 * dependency on one feature's types.
 */
export type ConfirmationDetails = {
  /** Identifies which confirmation this is, so the client picks the right copy. */
  reason: string;
  message: string;
  /** Rows the question is about, if any. */
  relatedIds?: string[];
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;
  readonly confirmation?: ConfirmationDetails;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: { fields?: FieldErrors; confirmation?: ConfirmationDetails } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.fields = options.fields;
    this.confirmation = options.confirmation;
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldErrors, message = "Invalid input") {
    super("VALIDATION_ERROR", 400, message, { fields });
  }
}

/**
 * "This is probably not what you meant — say so and I will do it."
 *
 * A 409, because the request conflicts with what is already stored. The
 * distinction from `ConflictError` is whether the user can do anything about
 * it: a duplicate email cannot be confirmed away, while a second application
 * for the same role at the same company genuinely might be intended.
 *
 * **Nothing is written when this is thrown.** It is raised inside the
 * transaction, before the write, so the rollback is what makes the retry safe —
 * the alternative, saving and then asking, is the behaviour this replaced.
 *
 * Re-sending the same request with its acknowledgement flag set is how the
 * client answers yes. There is deliberately no server-side token or pending
 * state: the second request stands on its own, so an abandoned dialog leaves
 * nothing behind to expire.
 */
export class ConfirmationRequiredError extends AppError {
  constructor(confirmation: ConfirmationDetails) {
    super("CONFIRMATION_REQUIRED", 409, confirmation.message, { confirmation });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in to continue") {
    super("UNAUTHORIZED", 401, message);
  }
}

/**
 * Also the correct error for "this row belongs to someone else" — a 403 would
 * confirm the row exists, which a 404 does not (DESIGN.md §6).
 */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fields?: FieldErrors) {
    super("CONFLICT", 409, message, fields);
  }
}

/**
 * Prisma's known-request errors are identified by duck-typing rather than with
 * `instanceof Prisma.PrismaClientKnownRequestError`, because that would mean
 * importing Prisma outside src/server/ and breaking the one-import-site rule in
 * DESIGN.md §4. The shape — an Error carrying a `P`-prefixed string `code` — is
 * stable across Prisma versions, and a false positive could only come from
 * another library's error that is also an Error with a P-code.
 */
function prismaErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

/**
 * Converts a thrown value into the response body described in DESIGN.md §6:
 * `{ error: { code, message, fields? } }`.
 *
 * Note the deliberate asymmetry — an `AppError`'s message is written by us for
 * the user and is safe to send, while anything else is logged in full and
 * reported as a generic failure.
 */
export function handleRouteError(error: unknown): Response {
  if (error instanceof AppError) {
    return errorResponse(error.status, error.code, error.message, {
      fields: error.fields,
      confirmation: error.confirmation,
    });
  }

  const code = prismaErrorCode(error);

  if (code === "P2002") {
    console.error("[api] unique constraint violation", error);
    return errorResponse(409, "CONFLICT", "That record already exists");
  }

  if (code === "P2025") {
    console.error("[api] record not found", error);
    return errorResponse(404, "NOT_FOUND", "Not found");
  }

  console.error("[api] unhandled error", error);

  return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  extras: { fields?: FieldErrors; confirmation?: ConfirmationDetails } = {},
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(extras.fields ? { fields: extras.fields } : {}),
        ...(extras.confirmation ? { confirmation: extras.confirmation } : {}),
      },
    },
    { status },
  );
}
