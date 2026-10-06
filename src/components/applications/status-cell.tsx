"use client";

import { useState } from "react";

import { StatusMenu } from "@/components/applications/status-menu";
import { useStatusChange } from "@/components/applications/use-status-change";
import type { ApplicationStatusValue } from "@/lib/constants/application";

/**
 * The status pill in a table row, which changes status.
 *
 * The same `StatusMenu` the board cards use, on purpose: moving an application
 * is one action with one control, and a user who learned it on the board should
 * not have to find a different affordance in the table. What the table does
 * *not* get is drag — rows have no spatial meaning here, so there is nothing to
 * drag onto, and the dropdown was always the primary control anyway (§1).
 *
 * A client island per row rather than a client table. The rows are rendered on
 * the server from the server's own query (§4), and this keeps that true: the
 * only thing shipped to the browser is one pill's worth of state, not the
 * sorting, the paging or the seven columns around it.
 */
export function StatusCell({
  id,
  status,
  jobTitle,
  companyName,
  className,
}: {
  id: string;
  status: ApplicationStatusValue;
  jobTitle: string;
  companyName: string;
  className?: string;
}) {
  const changeStatus = useStatusChange();

  /**
   * The locally chosen status, which leads the server until `router.refresh()`
   * brings the row back with it.
   *
   * An override rather than a copy: once the refresh lands, `status` says the
   * same thing this does and the override stops mattering — there is no moment
   * where it has to be cleared, and a filter change that re-renders the row
   * flows straight through. The board's overlay works the same way.
   */
  const [override, setOverride] = useState<ApplicationStatusValue | null>(null);
  const [isPending, setIsPending] = useState(false);

  const current = override ?? status;

  async function move(next: ApplicationStatusValue) {
    const previous = current;

    setOverride(next);
    setIsPending(true);

    const ok = await changeStatus({ id, status: next, jobTitle, companyName });

    // Put the pill back if the write failed. Leaving it on the new status is
    // the worst outcome available: the row would disagree with the database
    // until the next reload, and the user would have no reason to doubt it.
    if (!ok) {
      setOverride(previous);
    }

    setIsPending(false);
  }

  return (
    <StatusMenu
      status={current}
      onStatusChange={(next) => void move(next)}
      disabled={isPending}
      className={className}
    />
  );
}
