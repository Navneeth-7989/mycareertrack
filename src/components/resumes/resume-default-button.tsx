"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * Makes one resume the default, or clears it.
 *
 * **Not optimistic**, unlike the task checkbox it otherwise resembles. The
 * difference is that setting a default changes *another* row too — the previous
 * default loses the flag — and re-ordering the list is a server decision, since
 * the page is sorted default-first. Flipping this star locally would leave the
 * old default still starred and both rows in the wrong order until the refresh
 * landed, which is a worse flicker than the wait it saved.
 *
 * It toasts for the same reason: what changed is partly off-screen, on a row
 * somewhere else in the list. A checkbox is its own confirmation; this is not.
 */
export function ResumeDefaultButton({
  resume,
}: {
  resume: { id: string; label: string; isDefault: boolean };
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const next = !resume.isDefault;

  async function toggle() {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/resumes/${resume.id}/default`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // A real boolean: nothing types this, so there is no input whose value
        // it has to match.
        body: JSON.stringify({ isDefault: next }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not change the default resume.");

        setIsSaving(false);
        toast.add({ type: "error", title: "Default not changed", description: message });

        return;
      }

      setIsSaving(false);

      toast.add({
        type: "success",
        title: next ? "Default resume set" : "Default cleared",
        description: next
          ? `${resume.label} will be pre-selected on new applications.`
          : "New applications will start with no resume selected.",
      });

      router.refresh();
    } catch {
      setIsSaving(false);

      toast.add({
        type: "error",
        title: "Default not changed",
        description: "Check your connection and try again.",
      });
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={isSaving}
      onClick={() => void toggle()}
      // The filled star is the state, so the only thing left to carry the
      // *action* is this label — and it has to name the resume, because a column
      // of stars is otherwise heard as "button, button, button".
      aria-pressed={resume.isDefault}
    >
      <Star
        aria-hidden="true"
        className={resume.isDefault ? "fill-primary text-primary" : "text-muted-foreground"}
      />

      <span className="sr-only">
        {next
          ? `Make “${resume.label}” the default`
          : `Stop using “${resume.label}” as the default`}
      </span>
    </Button>
  );
}
