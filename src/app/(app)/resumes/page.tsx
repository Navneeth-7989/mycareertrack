import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Resumes · CareerTrack",
};

export default function ResumesPage() {
  return (
    <PlannedPage
      icon={FileText}
      title="Resumes"
      description="Every version you have sent, and which application received which one."
      arrivesWith="the storage and analytics work"
      whatsComing={[
        "Private upload",
        "Set a default",
        "Signed-URL download",
        "Soft delete",
        "Per-application version",
      ]}
    />
  );
}
