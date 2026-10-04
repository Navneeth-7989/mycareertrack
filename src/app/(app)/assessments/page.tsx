import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Assessments · CareerTrack",
};

export default function AssessmentsPage() {
  return (
    <PlannedPage
      icon={ClipboardList}
      title="Assessments"
      description="Online tests and take-home tasks, with the deadlines that actually matter surfaced first."
      arrivesWith="the timeline and interviews work"
      whatsComing={["Deadline surfacing", "Provider and link", "Score", "Status"]}
    />
  );
}
