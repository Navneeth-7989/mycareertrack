import type { Metadata } from "next";
import { Bell } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Notifications · CareerTrack",
};

export default function NotificationsPage() {
  return (
    <PlannedPage
      icon={Bell}
      title="Notifications"
      description="An in-app inbox that reminds you 24 hours before an interview or a deadline. There is no email — this inbox is the whole feature."
      arrivesWith="the storage and analytics work"
      whatsComing={["Unread badge", "Mark all read", "Preference toggles"]}
    />
  );
}
