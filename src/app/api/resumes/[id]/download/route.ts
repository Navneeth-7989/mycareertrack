import type { NextRequest } from "next/server";

import { NotFoundError, handleRouteError } from "@/lib/api/errors";
import { getResumeFile } from "@/server/queries/resumes";
import { requireApiUser } from "@/server/require-user";
import { createResumeDownloadUrl } from "@/server/services/resume-storage";

/**
 * `GET /api/resumes/:id/download` — ownership check, then a short-lived signed
 * URL (DESIGN.md §6).
 *
 * **The bucket is private, so this route is the only way to read a resume.**
 * There is no public URL for the object and `storagePath` never reaches the
 * browser (§3), which makes the `findFirst({ id, userId })` in `getResumeFile`
 * the single authorization check on every download in the product. A wrong id, a
 * stranger's id and a deleted resume all come back null and all answer 404 — a
 * 403 would confirm that someone else's resume exists (§6).
 *
 * **It redirects rather than returning the URL in a body**, which is the one
 * interpretation worth stating. §6 says "returns a short-lived signed URL", and a
 * 307 does — in the `Location` header. The payoff is that the download is a plain
 * `<a href>`: no client component, no fetch, no JavaScript, and the browser's own
 * download machinery handles a 5 MB transfer instead of our code buffering it.
 * The alternative, JSON plus a scripted navigation, would need a client island on
 * every row to achieve the same thing.
 *
 * The signed URL carries a `Content-Disposition` naming the original file, so
 * following it saves "Frontend Resume.pdf" rather than navigating the tab to a
 * UUID — see `createResumeDownloadUrl`.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/resumes/[id]/download">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    const resume = await getResumeFile(user.id, id);

    if (!resume) {
      throw new NotFoundError("Resume not found");
    }

    const url = await createResumeDownloadUrl(resume.storagePath, resume.fileName);

    /*
     * Built by hand rather than with `Response.redirect`, so the cache headers
     * can go on it. The URL in `Location` is a bearer credential with a 60-second
     * life: a shared cache holding this response would hand that credential to
     * the next person who asked, and a browser replaying it from cache would
     * follow an expired one. `no-store` closes both.
     */
    return new Response(null, {
      status: 307,
      headers: {
        Location: url,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
