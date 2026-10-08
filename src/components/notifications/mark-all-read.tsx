"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * Clears the whole inbox.
 *
 * **Not optimistic**, unlike the per-row tick. This changes every row at once,
 * so an optimistic version would have to hold an override for the entire list
 * and roll all of it back — and unlike a single tick, the user is not watching
 * one control they just pressed, they are waiting for a list to change. Waiting
 * for the server and refreshing is both simpler and what the user expects here.
 *
 * **No confirmation dialog.** Marking read destroys nothing: the notifications
 * stay, the events they point at stay, and the only thing lost is the unread
 * mark — which the user is deliberately clearing. A dialog in front of that is
 * a dialog nobody reads.
 *
 * It toasts, where the per-row tick does not, because the result is a count the
 * user cannot see — the rows that cleared were mostly below the fold.
 */
export function MarkAllRead({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function markAll() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not clear your notifications.");

        setIsSaving(false);
        toast.add({ type: "error", title: "Nothing was cleared", description: message });

        return;
      }

      setIsSaving(false);

      toast.add({
        type: "success",
        title: "Inbox cleared",
        description: `${unreadCount} notification${unreadCount === 1 ? "" : "s"} marked as read.`,
      });

      router.refresh();
    } catch {
      setIsSaving(false);
      toast.add({
        type: "error",
        title: "Nothing was cleared",
        description: "Check your connection and try again.",
      });
    }
  }

  return (
    <Button variant="outline" size="lg" disabled={isSaving} onClick={() => void markAll()}>
      <CheckCheck aria-hidden="true" data-icon="inline-start" />
      {isSaving ? "Clearing…" : "Mark all read"}
    </Button>
  );
}
