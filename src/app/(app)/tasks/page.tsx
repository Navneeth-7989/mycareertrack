import type { Metadata } from "next";
import { ListTodo } from "lucide-react";

import { PlannedPage } from "@/components/shared/planned-page";

export const metadata: Metadata = {
  title: "Tasks · CareerTrack",
};

export default function TasksPage() {
  return (
    <PlannedPage
      icon={ListTodo}
      title="Tasks"
      description="Follow-ups and to-dos, each attached to the application it belongs to."
      arrivesWith="the timeline and interviews work"
      whatsComing={["Overdue", "Due today", "Upcoming", "Completed"]}
    />
  );
}
