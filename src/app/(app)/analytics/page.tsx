import type { Metadata } from "next";
import { ChartColumnBig } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Analytics · CareerTrack",
};

export default function AnalyticsPage() {
  return (
    <PlannedPage
      icon={ChartColumnBig}
      title="Analytics"
      description="Response rates, interview conversion and how long companies actually take to reply."
      arrivesWith="the storage and analytics work"
      whatsComing={[
        "Response and interview rates",
        "Average response time",
        "Status funnel",
        "Source breakdown",
      ]}
    />
  );
}
