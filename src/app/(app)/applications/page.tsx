import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Applications · CareerTrack",
};

/**
 * Still a placeholder, but no longer an empty promise: creating an application
 * works, so this page links to it even though the views that list the results
 * arrive in the next step. The list and board replace this file wholesale then.
 */
export default function ApplicationsPage() {
  return (
    <PlannedPage
      icon={Briefcase}
      title="Applications"
      description="Every role you have applied to or saved, as a board you can drag and a table you can search."
      arrivesWith="the next step of the applications work"
      whatsComing={["Table with filters", "Kanban board", "Search and sort", "Detail page"]}
      actions={
        <Button size="lg" render={<Link href="/applications/new" />}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New application
        </Button>
      }
    />
  );
}
