import type { Metadata } from "next";
import { Users } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Contacts · CareerTrack",
};

export default function ContactsPage() {
  return (
    <PlannedPage
      icon={Users}
      title="Contacts"
      description="Recruiters and referrals, linked to the applications they belong to. Most will be created for you from the application form."
      arrivesWith="the timeline and interviews work"
      whatsComing={[
        "Auto-created from an application",
        "Duplicate warning",
        "Linked applications",
        "Add directly",
      ]}
    />
  );
}
