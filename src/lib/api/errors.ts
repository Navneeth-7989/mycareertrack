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
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, status: number, message: string, fields?: FieldErrors) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldErrors, message = "Invalid input") {
    super("VALIDATION_ERROR", 400, message, fields);
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
    return errorResponse(error.status, error.code, error.message, error.fields);
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
  fields?: FieldErrors,
): Response {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}
