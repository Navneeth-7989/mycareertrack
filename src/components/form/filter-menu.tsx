"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

/**
 * A multi-select filter: a button that says what is chosen, and a menu of
 * tickable options.
 *
 * A menu of checkbox items rather than a chips combobox, because the lists are
 * short — nine statuses, three work modes, a few dozen companies — and a search
 * field inside a nine-item list is friction pretending to be a feature. The
 * items do not close the menu when ticked (`MenuCheckboxItem` sets
 * `closeOnClick={false}`), so choosing three statuses is one trip.
 *
 * The trigger's label is the point of the whole control. "Status" means nothing
 * is filtered; "Interview" names the single choice; "Status · 3" counts them
 * once naming them would not fit. A filter whose button looks identical whether
 * or not it is active is how users end up staring at an empty list wondering
 * where their data went.
 */

export type FilterOption = {
  value: string;
  label: string;
  /** Shown right-aligned. The number of rows this option would match. */
  count?: number;
};

export function FilterMenu({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  emptyMessage = "Nothing to filter by yet.",
  className,
}: {
  label: string;
  options: readonly FilterOption[];
  value: readonly string[];
  onValueChange: (next: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
}) {
  const chosen = new Set(value);

  // Options are matched against `value` rather than the reverse, so a filter
  // left in the URL for a company that has since been deleted does not render
  // as a ghost row — it simply stops being counted.
  const live = options.filter((option) => chosen.has(option.value));

  function toggle(option: string, checked: boolean) {
    const next = new Set(value);

    if (checked) {
      next.add(option);
    } else {
      next.delete(option);
    }

    // Emitted in the options' own order, not click order, so the resulting URL
    // is the same whichever way round the user ticked things.
    onValueChange(options.filter((item) => next.has(item.value)).map((item) => item.value));
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || options.length === 0}
            className={cn(
              live.length > 0 && "border-primary/40 bg-accent text-accent-foreground",
              className,
            )}
          />
        }
      >
        <span className="max-w-40 truncate">
          {live.length === 0 ? label : live.length === 1 ? live[0]!.label : label}
        </span>

        {live.length > 1 && (
          <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold">
            {live.length}
          </span>
        )}

        <ChevronDown aria-hidden="true" className="text-muted-foreground" data-icon="inline-end" />
      </MenuTrigger>

      <MenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-2.5 py-3 text-[0.8125rem]">{emptyMessage}</p>
        ) : (
          <>
            {options.map((option) => (
              <MenuCheckboxItem
                key={option.value}
                checked={chosen.has(option.value)}
                onCheckedChange={(checked) => toggle(option.value, checked)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>

                {option.count !== undefined && (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {option.count}
                  </span>
                )}
              </MenuCheckboxItem>
            ))}

            {/*
             * Only offered when there is something to clear. A permanently
             * visible "Clear" on an untouched filter is a control that does
             * nothing, which teaches users that controls here might do nothing.
             */}
            {live.length > 0 && (
              <>
                <MenuSeparator />

                <button
                  type="button"
                  onClick={() => onValueChange([])}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground w-full rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition-colors"
                >
                  Clear {label.toLowerCase()}
                </button>
              </>
            )}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
