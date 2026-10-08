"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * The tick that clears one notification.
 *
 * **Optimistic**, like `TaskCheckbox` and for the same reason: the user has
 * clicked a control whose entire meaning is its own state, and a round trip
 * before the row visibly dims makes the inbox feel broken. The one difference
 * is that this is irreversible from the UI — there is no un-read — so a failure
 * must put the control back rather than leave a row looking cleared.
 *
 * It refreshes afterwards because the badge in the topbar is server-rendered
 * from a count this click just changed. That is the whole reason this island
 * exists rather than the row being a plain link: marking read has to update
 * chrome outside the page.
 *
 * **The button disappears once the row is read**, rather than becoming a
 * disabled tick. A control that can never be used again is noise in a list, and
 * the row's own styling already says which ones are read.
 */
export function MarkRead({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function markRead() {
    setCleared(true);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not mark that as read.");

        setCleared(false);
        setIsSaving(false);
        toast.add({ type: "error", title: "Not marked as read", description: message });

        return;
      }

      setIsSaving(false);

      /*
       * No success toast — the row dimming is the confirmation, and a toast per
       * tick in a list would bury the ones reporting failures. "Mark all read"
       * does toast, because its result is a number the user cannot see.
       */
      router.refresh();
    } catch {
      setCleared(false);
      setIsSaving(false);
      toast.add({
        type: "error",
        title: "Not marked as read",
        description: "Check your connection and try again.",
      });
    }
  }

  if (cleared) return null;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={isSaving}
      onClick={() => void markRead()}
      // Names the notification, so a column of these is not heard as "button,
      // button, button".
      aria-label={`Mark “${title}” as read`}
      className="shrink-0"
    >
      <Check aria-hidden="true" />
    </Button>
  );
}
