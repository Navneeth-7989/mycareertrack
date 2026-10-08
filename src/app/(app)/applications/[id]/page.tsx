import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailContacts } from "@/components/applications/detail-contacts";
import { DetailDescription } from "@/components/applications/detail-description";
import { DetailFacts } from "@/components/applications/detail-facts";
import { DetailHeader } from "@/components/applications/detail-header";
import { DetailStats } from "@/components/applications/detail-stats";
import { DetailTimeline } from "@/components/applications/detail-timeline";
import { getApplication } from "@/server/queries/applications";
import { requireUser } from "@/server/require-user";

/**
 * `/applications/[id]` — one application.
 *
 * The destination every row, card and successful save has been pointing at
 * since step 2. A Server Component that reads Postgres directly (§4): no
 * client-side fetch, and the only JavaScript shipped is the status pill and the
 * job description's collapse.
 *
 * It is also the first page where a URL can name a row the user does not own.
 * The whole of that defence lives in the query — `findFirst({ id, userId })` —
 * and the only thing this page does about it is turn null into `notFound()`,
 * which answers 404 rather than 403 so the response never confirms that
 * someone else's application exists (§6).
 */

/**
 * One read, two consumers: `generateMetadata` and the page body both need the
 * application, and Next calls them separately.
 *
 * `cache()` is what keeps that from being two round trips. It memoises per
 * request, so the second call is free — and it is the same mechanism
 * `requireUser()` uses for exactly the same reason. The alternative, passing
 * the row from one to the other, is not available: there is no path between
 * them.
 */
const loadApplication = cache(async (id: string) => {
  const user = await requireUser();

  return getApplication(user.id, id);
});

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await params;
  const application = await loadApplication(id);

  return {
    /*
     * No `notFound()` here. Deciding the route's fate belongs in the page, and
     * throwing from metadata as well buys nothing — it was measured: the
     * response status is already committed by then, because `(app)/layout.tsx`
     * is async and the shell has begun streaming before either this or the page
     * body runs. A missing application therefore renders the right not-found UI
     * under a `200`. That is a cosmetic wrong answer rather than a leak: §6's
     * concern is that a response must not reveal whether someone else's row
     * exists, and both cases produce byte-identical output. The API route,
     * which is the one a client reads a status from, returns a true 404.
     */
    title: application
      ? `${application.jobTitle} · ${application.company.name} · CareerTrack`
      : "Application · CareerTrack",
  };
}

export default async function ApplicationDetailPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  const application = await loadApplication(id);

  if (!application) {
    // Throws, so nothing below runs and `application` stays narrowed. Never
    // wrapped in a try/catch — that would swallow the interrupt and render the
    // page with no data.
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader application={application} />

      <DetailStats application={application} />

      {/*
       * Two columns from `lg`, and `items-start` so the shorter column's cards
       * keep their own height instead of stretching to match the taller one.
       *
       * The split is by permanence rather than by importance. The left column
       * is what changes — the history, and the description someone re-reads
       * before an interview — while the right is reference: the facts that were
       * typed once and the person to contact. Below `lg` that order flattens
       * into the same sequence, which is the right reading order on a phone.
       */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetailTimeline
            applicationId={application.id}
            events={application.events}
            hasMore={application.hasMoreEvents}
          />

          {application.jobDescription ? (
            <DetailDescription description={application.jobDescription} />
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <DetailFacts application={application} />

          {/*
           * Omitted rather than shown empty. An application with no recruiter
           * has nothing to say here, and "No contacts yet" in a card is a
           * Phase 3 affordance — there is no way to add one from this page yet,
           * so the empty state would be a prompt with no button.
           */}
          {application.contacts.length > 0 ? (
            <DetailContacts contacts={application.contacts} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
