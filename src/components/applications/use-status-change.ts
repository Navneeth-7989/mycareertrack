"use client";

import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatusValue,
} from "@/lib/constants/application";

/**
 * The one way an application's status is written from the client.
 *
 * Three callers now reach the same endpoint — a board card's dropdown, a board
 * drag, and a table row's dropdown — and each needs the identical request,
 * toast pair and `router.refresh()`. Copying that into the table is how the two
 * views end up disagreeing about what a failure looks like, so it lives here
 * once.
 *
 * What is deliberately *not* here is the optimistic update. The board has to
 * re-group cards across columns and adjust column counts; a table row only has
 * to recolour one pill. Those are different enough that a shared "optimistic
 * state" abstraction would be a worse fit than each view holding its own. So
 * this returns a plain boolean — true if the write landed — and the caller
 * decides what to roll back.
 */
export function useStatusChange() {
  const router = useRouter();

  return async function changeStatus({
    id,
    status,
    jobTitle,
    companyName,
  }: {
    id: string;
    status: ApplicationStatusValue;
    /** Only for the toast: "Moved to Interview · Backend Engineer at Stripe". */
    jobTitle: string;
    companyName: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`/api/applications/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not move that application.");

        toast.add({ type: "error", title: "Status not changed", description: message });

        return false;
      }

      toast.add({
        type: "success",
        title: `Moved to ${APPLICATION_STATUS_LABELS[status]}`,
        description: `${jobTitle} at ${companyName}`,
      });

      // Re-render the page from the server: the column counts, the pagination
      // total, the dashboard tiles and the timeline event all moved, and none
      // of them are things a single row should try to recompute.
      router.refresh();

      return true;
    } catch {
      toast.add({
        type: "error",
        title: "Status not changed",
        description: "Check your connection and try again.",
      });

      return false;
    }
  };
}
