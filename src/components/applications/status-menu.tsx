"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { APPLICATION_STATUS_TONES } from "@/components/applications/status-badge";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_HINTS,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatusValue,
} from "@/lib/constants/application";

/**
 * The status control: a pill that opens a list of the nine statuses.
 *
 * **This is the primary way status changes, not drag-and-drop.** §1 is explicit
 * about why — mobile Kanban is the hardest single piece of UI in the product,
 * so the design makes the dropdown the real control and drag a convenience.
 * The consequence that matters: nothing about moving an application through the
 * pipeline depends on drag working, on a touch device, under a thumb, on a
 * horizontally scrolling board.
 *
 * It looks like the `StatusBadge` it sits in place of, because it is the same
 * information with one affordance added. A separate visual language for "the
 * status" and "the status you can change" would make the board read as two
 * different things.
 */
export function StatusMenu({
  status,
  onStatusChange,
  disabled = false,
  className,
}: {
  status: ApplicationStatusValue;
  onStatusChange: (next: ApplicationStatusValue) => void;
  disabled?: boolean;
  className?: string;
}) {
  const tone = APPLICATION_STATUS_TONES[status];

  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        aria-label={`Status: ${APPLICATION_STATUS_LABELS[status]}. Change status`}
        className={cn(
          "focus-visible:ring-ring/40 inline-flex h-6 w-fit shrink-0 cursor-default items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-[filter,opacity] outline-none hover:brightness-[0.97] focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-60 dark:hover:brightness-110",
          tone.pill,
          className,
        )}
      >
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />

        {APPLICATION_STATUS_LABELS[status]}

        <ChevronDown aria-hidden="true" className="-mr-0.5 size-3 opacity-70" />
      </MenuTrigger>

      {/*
       * Capped at 19rem, not left to its own height. Nine two-line options come
       * to roughly 26rem, which is taller than the space above or below a card
       * sitting mid-board — so the menu would be clamped to the viewport by
       * `MenuContent` anyway, and the clamp would land at a different height on
       * every card. A fixed cap makes it one predictable panel that always
       * scrolls, rather than a panel whose length depends on where you clicked.
       *
       * `min()` against `--available-height` keeps the viewport the hard limit:
       * on a short window the smaller of the two wins.
       */}
      <MenuContent align="start" className="max-h-[min(var(--available-height),19rem)] min-w-60">
        <MenuRadioGroup
          value={status}
          onValueChange={(next) => {
            if (typeof next === "string" && next !== status) {
              onStatusChange(next as ApplicationStatusValue);
            }
          }}
        >
          {APPLICATION_STATUSES.map((option) => (
            <MenuRadioItem key={option} value={option}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      APPLICATION_STATUS_TONES[option].dot,
                    )}
                  />
                  {APPLICATION_STATUS_LABELS[option]}
                </span>

                {/* The same hints the create form shows. "Screening" and
                    "Assessment" are not self-evident, and a user guessing
                    between them produces analytics nobody can trust. */}
                <span className="text-muted-foreground pl-3.5 text-xs">
                  {APPLICATION_STATUS_HINTS[option]}
                </span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
