import type { Metadata } from "next";
import { Briefcase } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Applications · CareerTrack",
};

export default function ApplicationsPage() {
  return (
    <PlannedPage
      icon={Briefcase}
      title="Applications"
      description="Every role you have applied to or saved, as a board you can drag and a table you can search."
      arrivesWith="the applications work"
      whatsComing={[
        "Create form",
        "Company autocomplete",
        "Duplicate detection",
        "Kanban board",
        "Table with filters",
        "Detail page",
      ]}
    />
  );
}
