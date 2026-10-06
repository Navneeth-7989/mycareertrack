import { z } from "zod";

/**
 * The client half of the error contract in DESIGN.md §6.
 *
 * A failed `fetch` returns a body we did write, but the browser has no way to
 * know that — a proxy, a 502 from the platform, or an HTML error page all
 * arrive through the same call. Parsing the envelope instead of asserting its
 * shape is what keeps a form from crashing on an unexpected response, and keeps
 * `any` off the boundary.
 */
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    fields: z.record(z.string(), z.string()).optional(),
    /**
     * Present on a `CONFIRMATION_REQUIRED` response: the question to put to the
     * user, and the rows it is about. See `ConfirmationRequiredError`.
     */
    confirmation: z
      .object({
        reason: z.string(),
        message: z.string(),
        relatedIds: z.array(z.string()).optional(),
      })
      .optional(),
  }),
});

export type ApiError = {
  /**
   * The machine-readable code, when the body was ours. A caller that branches
   * on this must treat `undefined` as "something else went wrong" — a proxy's
   * HTML error page has no code, and neither does a 502.
   */
  code?: string;
  message: string;
  fields: Record<string, string>;
  confirmation?: {
    reason: string;
    message: string;
    relatedIds?: string[];
  };
};

/**
 * Reads an error response, falling back to `fallbackMessage` whenever the body
 * is missing, unparseable, or not our envelope.
 */
export async function readApiError(
  response: Response,
  fallbackMessage = "Something went wrong. Please try again.",
): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorEnvelopeSchema.safeParse(body);

  if (!parsed.success) {
    return { message: fallbackMessage, fields: {} };
  }

  const { code, message, fields, confirmation } = parsed.data.error;

  return {
    ...(code ? { code } : {}),
    message: message ?? fallbackMessage,
    fields: fields ?? {},
    ...(confirmation ? { confirmation } : {}),
  };
}
