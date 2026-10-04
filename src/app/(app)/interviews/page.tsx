import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Interviews · CareerTrack",
};

export default function InterviewsPage() {
  return (
    <PlannedPage
      icon={CalendarClock}
      title="Interviews"
      description="Every round you have scheduled, split into what is still ahead and what has already happened."
      arrivesWith="the timeline and interviews work"
      whatsComing={["Schedule a round", "Upcoming and past", "Prep notes", "Result tracking"]}
    />
  );
}
