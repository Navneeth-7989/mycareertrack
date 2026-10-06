"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, GripVertical, MapPin } from "lucide-react";
import { cn } from "cn";

import { StatusMenu } from "@/components/applications/status-menu";
import {
  EMPLOYMENT_TYPE_LABELS,
  PRIORITY_LABELS,
  type ApplicationStatusValue,
} from "@/lib/constants/application";
import { WORK_MODE_LABELS } from "@/lib/constants/work-mode";
import { formatDateOnly, toDateInputValue, todayAsDateOnly } from "@/lib/utils/date-only";
import type { ApplicationListItem } from "@/server/queries/applications";

/**
 * One application on the board.
 *
 * The drag handle is a handle, not the whole card. Making the card draggable
 * would mean every interactive thing on it — the title link, the status pill —
 * has to fight the drag sensor for the same pointer, and the usual result is a
 * link that sometimes navigates and sometimes starts a drag. A dedicated grip
 * keeps both unambiguous, and it is also the only honest place to hang the
 * "this is movable" affordance.
 *
 * The handle is hidden from assistive technology and absent on touch. Keyboard
 * and touch users change status through the dropdown, which is the primary
 * control (see `StatusMenu`) — not a lesser fallback.
 */
export function KanbanCard({
  item,
  status,
  onStatusChange,
  isPending = false,
  draggable = true,
}: {
  item: ApplicationListItem;
  /** The displayed status, which during an optimistic move leads the server. */
  status: ApplicationStatusValue;
  onStatusChange: (next: ApplicationStatusValue) => void;
  isPending?: boolean;
  draggable?: boolean;
}) {
  /*
   * `attributes` is deliberately not spread. dnd-kit's are for making a handle
   * an accessible keyboard-draggable control — `role="button"`, a tab stop, an
   * `aria-roledescription` — and all of that contradicts what this handle is.
   * It is pointer-only, hidden from assistive technology, and absent on touch,
   * because the status dropdown is the accessible path and it is the *primary*
   * control rather than a fallback (§1).
   *
   * Spreading them would also put a tab stop on every card: fifty cards would
   * be fifty presses of Tab to get past a control a keyboard cannot use
   * anyway.
   */
  const { listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { status },
    disabled: !draggable,
  });

  return (
    <article
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      className={cn(
        "border-border bg-card group/card relative flex flex-col gap-2.5 rounded-xl border p-3 shadow-xs transition-[opacity,box-shadow]",
        // The original stays in place at low opacity while the DragOverlay
        // carries the real card. Removing it instead would collapse the column
        // under the pointer mid-drag.
        isDragging && "opacity-40",
        isPending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/applications/${item.id}`}
          className="focus-visible:ring-ring/40 min-w-0 flex-1 rounded-md focus-visible:ring-3 focus-visible:outline-none"
        >
          <span className="block truncate text-[0.8125rem] leading-snug font-medium">
            {item.jobTitle}
          </span>
          <span className="text-muted-foreground block truncate text-xs">{item.company.name}</span>
        </Link>

        {draggable && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            // Hidden from assistive technology on purpose: the dropdown below
            // is the accessible path, and announcing a drag handle that needs a
            // pointer would be offering a control that cannot be used.
            aria-hidden="true"
            tabIndex={-1}
            className="text-muted-foreground/40 group-hover/card:text-muted-foreground/80 -mt-0.5 -mr-1 hidden shrink-0 cursor-grab touch-none rounded p-0.5 transition-colors active:cursor-grabbing md:block"
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {locationLabel(item) && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{locationLabel(item)}</span>
          </span>
        )}

        {item.employmentType && <span>{EMPLOYMENT_TYPE_LABELS[item.employmentType]}</span>}

        {item.deadline && <Deadline deadline={item.deadline} status={status} />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusMenu status={status} onStatusChange={onStatusChange} disabled={isPending} />

        {item.priority !== "MEDIUM" && (
          <span
            className={cn(
              "text-xs font-medium",
              item.priority === "HIGH" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {PRIORITY_LABELS[item.priority]}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * The card as it looks under the pointer. No drag handle, no status menu — it
 * is a picture of a card being moved, and an interactive control inside a
 * floating overlay cannot be clicked anyway.
 */
export function KanbanCardPreview({ item }: { item: ApplicationListItem }) {
  return (
    <article className="border-primary/40 bg-card flex w-[17rem] rotate-1 flex-col gap-1 rounded-xl border p-3 shadow-lg">
      <span className="truncate text-[0.8125rem] leading-snug font-medium">{item.jobTitle}</span>
      <span className="text-muted-foreground truncate text-xs">{item.company.name}</span>
    </article>
  );
}

function locationLabel(item: ApplicationListItem): string | null {
  const parts = [item.location, item.workMode ? WORK_MODE_LABELS[item.workMode] : null].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Past deadlines are flagged, but not once the application is closed (§8). */
function Deadline({ deadline, status }: { deadline: Date; status: ApplicationStatusValue }) {
  const closed = status === "REJECTED" || status === "WITHDRAWN" || status === "ACCEPTED";
  const overdue = !closed && toDateInputValue(deadline) < todayAsDateOnly();

  return (
    <span
      className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}
    >
      <CalendarClock aria-hidden="true" className="size-3 shrink-0" />
      {formatDateOnly(deadline)}
    </span>
  );
}
