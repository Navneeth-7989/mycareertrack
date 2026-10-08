import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ResumeFileKind } from "@/lib/constants/resume";

import { requireEnv } from "../env";

/**
 * The private Supabase bucket that holds resume files (DESIGN.md §6, §7 Phase 4).
 *
 * **The only external service in the product besides the database and the OAuth
 * providers**, and the only one that stores user content. Auth does *not* run
 * through Supabase — that is Auth.js with the Prisma adapter — and conflating the
 * two has already caused one wrong answer on this project. Supabase is storage,
 * nothing else.
 *
 * Three operations, which is the whole surface: put a file somewhere nobody can
 * guess, mint a short-lived URL for its owner, and delete it for real. The bucket
 * is private, so there is no public URL for an object at all — a signed URL is
 * the only way to read one, and `GET /api/resumes/:id/download` is the only thing
 * that mints them, after the ownership check.
 *
 * The client is built with the **secret** key, which bypasses row-level security
 * entirely. That is why this module lives under `src/server/` next to `db.ts` and
 * is subject to the same rule: authorization happens in our own queries, in the
 * WHERE clause (§4). Nothing here checks who is asking, because by the time a
 * path reaches these functions the caller has already proved it owns the row that
 * named it.
 */

/**
 * How long a download link lives.
 *
 * Long enough to follow a redirect and start a transfer, short enough that a URL
 * copied out of a history file or a server log is no longer a key to the file by
 * the time anyone reads it. The link is single-purpose and is minted fresh on
 * every click, so there is nothing to gain from a longer window.
 */
const SIGNED_URL_TTL_SECONDS = 60;

type ResumeBucket = ReturnType<SupabaseClient["storage"]["from"]>;

let bucket: ResumeBucket | null = null;

/**
 * The bucket handle, built once per process on first use.
 *
 * Lazy rather than created at module load — the opposite of `db.ts`, and
 * deliberately. `next build` imports every route module to collect its exports,
 * so a module-scope `requireEnv` here would make the storage variables a
 * *build-time* requirement for anyone building the project, including on a
 * machine that is only type-checking. Deferring to the first call still fails
 * loudly, still names the missing variable, and fails at the request that needed
 * it rather than at the build that did not.
 */
function resumeBucket(): ResumeBucket {
  bucket ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    {
      // There is no user session here and nothing to refresh: this is a server
      // process holding a service key, not a browser holding a login. Left on, the
      // client starts a refresh timer that keeps the process awake for nothing.
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ).storage.from(requireEnv("SUPABASE_RESUME_BUCKET"));

  return bucket;
}

/**
 * Where a newly uploaded resume goes.
 *
 * **Nothing the user controls appears in the path.** §6 sketches
 * `{userId}/{resumeId}/{filename}`, and the filename is the part that is dropped
 * here: a storage key built from an uploaded name is the standard way traversal,
 * overwrites and header injection get in, and a name is only ever needed for
 * *display* — which is what the `fileName` column is for. The original name is
 * preserved there and handed back by the download link, so nothing is lost.
 *
 * A random UUID rather than the row's id, because the file is uploaded *before*
 * the row exists (see `createResume` for why that order is the safe one) and a
 * cuid that Prisma has not generated yet cannot be in the path. It also makes the
 * key unguessable, which matters if the bucket is ever made public by accident.
 *
 * The `userId` prefix is not a security boundary — the bucket is private and
 * every read goes through our own ownership check — but it makes an object's
 * owner legible when looking at the bucket directly, which is worth a prefix.
 */
export function buildResumeStoragePath(userId: string, kind: ResumeFileKind): string {
  return `${userId}/${randomUUID()}.${kind}`;
}

/**
 * Stores the bytes. Throws on failure, which `handleRouteError` turns into a
 * logged 500 — a storage outage is a server fault, not something the user
 * mistyped.
 *
 * `upsert: false` so a path collision is an error rather than a silent
 * overwrite. With a UUID in the key it should be unreachable; if it ever happens,
 * failing is the only answer that cannot destroy somebody's file.
 */
export async function uploadResumeFile(input: {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<void> {
  const { error } = await resumeBucket().upload(input.path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`[storage] resume upload failed: ${error.message}`);
  }
}

/**
 * A short-lived URL that **saves** the file under its original name.
 *
 * `download` is what makes Supabase send `Content-Disposition: attachment` with
 * that name, so the browser saves "Navneet Shahi Frontend.pdf" rather than the
 * UUID in the key. The name has been through `sanitizeFileName`, which is what
 * keeps a newline out of that header.
 */
export async function createResumeDownloadUrl(path: string, fileName: string): Promise<string> {
  return signResumeUrl(path, fileName);
}

/**
 * A short-lived URL that **renders** the file in place.
 *
 * The only difference is the absence of the `download` option, and that is the
 * whole mechanism: measured against the real bucket, a signed URL without it
 * comes back as `Content-Type: application/pdf` with **no `Content-Disposition`
 * at all** — which is exactly the pair of headers that makes a browser display a
 * PDF instead of saving it.
 *
 * Also measured, because the in-app preview depends on it: object responses
 * carry **no `X-Frame-Options` and no CSP `frame-ancestors`**, so this URL can be
 * the `src` of an `<iframe>` on our own page. If Supabase ever starts sending
 * either, the preview dialog breaks and its "Open in new tab" link becomes the
 * only path — which is part of why that link is always there.
 *
 * Only offered for formats a browser can actually render. See `canPreviewResume`
 * — a DOCX has no inline representation, and a URL that promised one would just
 * download the file while looking like it had failed to display it.
 */
export async function createResumeViewUrl(path: string): Promise<string> {
  return signResumeUrl(path);
}

/**
 * **Signing checks that the object exists** — measured, not assumed. A path with
 * nothing behind it fails *here*, with "Object not found", rather than producing
 * a URL that 404s when it is followed. That is the opposite of what a signature
 * usually is, and it is worth knowing because it decides where a missing object
 * surfaces: this call throws, so the caller answers 500, where a URL that merely
 * resolved to nothing would have let the browser show the 404.
 *
 * It does not change the normal path — `getResumeFile` filters out deleted rows,
 * so a path that reaches here is one whose file should be present.
 */
async function signResumeUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await resumeBucket().createSignedUrl(
    path,
    SIGNED_URL_TTL_SECONDS,
    download ? { download } : undefined,
  );

  if (error || !data?.signedUrl) {
    throw new Error(`[storage] could not sign resume url: ${error?.message ?? "no url returned"}`);
  }

  return data.signedUrl;
}

/**
 * Deletes the object for real — the half of "soft delete" that is not soft (§9).
 *
 * The `Resume` row survives so past applications can still say which version was
 * sent, but the file itself goes: keeping a document the user asked to delete
 * would make the record a promise we had quietly broken.
 *
 * **Idempotent.** Supabase reports removing a path that is not there as a
 * success, which is what makes a retried delete converge rather than getting
 * stuck on the object it already removed.
 */
export async function removeResumeFile(path: string): Promise<void> {
  const { error } = await resumeBucket().remove([path]);

  if (error) {
    throw new Error(`[storage] resume delete failed: ${error.message}`);
  }
}
