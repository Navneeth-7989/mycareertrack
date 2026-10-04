import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Settings · CareerTrack",
};

export default function SettingsPage() {
  return (
    <PlannedPage
      icon={Settings}
      title="Settings"
      description="Preferences for your account — what you get reminded about, and how the app opens."
      arrivesWith="the storage and analytics work"
      whatsComing={["Reminder toggles", "Default view", "Timezone"]}
    />
  );
}
