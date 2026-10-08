"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * The tick on a task — the most frequent write in the product.
 *
 * **Optimistic, which is the one place in Phase 3 that is.** Everywhere else a write
 * waits for the server and then calls `router.refresh()`, because the result changes
 * grouping, ordering or derived columns the client cannot compute. A checkbox is
 * different: the user has just clicked a control whose entire meaning is its own
 * state, and a 300ms delay before it visibly ticks makes the list feel broken. So the
 * box flips immediately and rolls back if the request fails.
 *
 * It still refreshes afterwards. Ticking a task moves it between buckets — out of
 * "Overdue" and into "Completed" — and that is a server decision, so the optimistic
 * state covers only the gap until the real list arrives.
 */
export function TaskCheckbox({
  id,
  title,
  isCompleted,
}: {
  id: string;
  title: string;
  isCompleted: boolean;
}) {
  const router = useRouter();

  /**
   * The optimistic override, or null when the prop is the truth.
   *
   * Null rather than seeding from the prop, so a refreshed list immediately governs
   * again. Seeding would mean holding a copy that goes stale the moment the server
   * answers — and syncing it back from the prop would need an effect, which the React
   * Compiler's `react-hooks/set-state-in-effect` rule forbids.
   */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const checked = optimistic ?? isCompleted;

  async function toggle(next: boolean) {
    setOptimistic(next);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/tasks/${id}/completion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // A real boolean, not a string: nothing types this, so there is no input
        // whose value it has to match.
        body: JSON.stringify({ isCompleted: next }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not update that task.");

        // Rolled back to whatever the server last told us, which is the prop.
        setOptimistic(null);
        setIsSaving(false);

        toast.add({ type: "error", title: "Task not updated", description: message });

        return;
      }

      setIsSaving(false);

      /*
       * No success toast. This is a checkbox: the tick *is* the confirmation, and a
       * toast on every tick would bury the ones that report failures. The other
       * mutations in this phase toast because their result is not visible at the
       * point of the click.
       */
      router.refresh();
    } catch {
      setOptimistic(null);
      setIsSaving(false);

      toast.add({
        type: "error",
        title: "Task not updated",
        description: "Check your connection and try again.",
      });
    }
  }

  return (
    <Checkbox
      checked={checked}
      disabled={isSaving}
      onCheckedChange={(next) => void toggle(next === true)}
      // Names the task, so a column of checkboxes is not heard as "checkbox,
      // checkbox, checkbox" by a screen reader.
      aria-label={checked ? `Mark “${title}” as not done` : `Mark “${title}” as done`}
      className="mt-0.5"
    />
  );
}
