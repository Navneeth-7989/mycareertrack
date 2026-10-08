import type { NextRequest } from "next/server";

import { NotFoundError, handleRouteError } from "@/lib/api/errors";
import { canPreviewResume } from "@/lib/constants/resume";
import { getResumeFile } from "@/server/queries/resumes";
import { requireApiUser } from "@/server/require-user";
import { createResumeViewUrl } from "@/server/services/resume-storage";

/**
 * `GET /api/resumes/:id/view` — the same file, rendered instead of saved.
 *
 * The sibling of `/download`, and the two differ in exactly one way: this one
 * signs without the `download` option, so the response carries a PDF content
 * type and no `Content-Disposition` and the browser displays it. Everything else
 * — the ownership check, the 60-second signature, the 307, the no-store headers
 * — is identical, and deliberately so: a preview is a *read of the same private
 * file*, and giving it a weaker check because it only "looks" at the document
 * would be the kind of distinction that turns into a hole.
 *
 * **It is the `src` of an `<iframe>` in the preview dialog**, which is why it is
 * a route rather than an endpoint returning a URL: the iframe follows the
 * redirect itself, so the signed URL is never handed to our own JavaScript and
 * there is nothing client-side to leak or to keep fresh.
 *
 * A format a browser cannot render answers **404 rather than falling back to a
 * download**. There is no inline representation of a DOCX to serve, and quietly
 * sending the attachment instead would make this endpoint lie about what it did.
 * `canPreviewResume` is the same predicate the row uses to decide whether to
 * offer the trigger, so a 404 here means the UI and the route have disagreed —
 * not that the user asked for something unreasonable.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/resumes/[id]/view">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    const resume = await getResumeFile(user.id, id);

    if (!resume || !canPreviewResume(resume.mimeType)) {
      throw new NotFoundError("Resume not found");
    }

    const url = await createResumeViewUrl(resume.storagePath);

    /*
     * `no-store` for the same reason as the download route: the URL in
     * `Location` is a bearer credential with a 60-second life, and a cache
     * holding this response would hand it to whoever asked next.
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
