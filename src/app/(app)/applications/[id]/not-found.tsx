import { FileQuestion } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";

/**
 * What `notFound()` in this segment renders.
 *
 * Scoped to `applications/[id]` rather than left to the global 404, because
 * this one knows what the user was looking for and can offer the list they
 * almost certainly want. It also stays inside the `(app)` shell — sidebar,
 * topbar and all — so a mistyped id does not feel like being thrown out of the
 * product.
 *
 * The wording is careful about something §6 is explicit on. A deleted
 * application and another user's application produce the identical 404, and the
 * copy has to be true of both without hinting at which one happened: "we cannot
 * find it" is honest in either case, while "this application was deleted" would
 * confirm that someone else's row exists.
 */
export default function ApplicationNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={FileQuestion}
        title="We cannot find that application"
        description="The link may be out of date, or the application may have been deleted. Your other applications are all still here."
        action={<ButtonLink href="/applications">Back to applications</ButtonLink>}
      />
    </div>
  );
}
