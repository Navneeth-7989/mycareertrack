import Link from "next/link";
import { Columns3, List } from "lucide-react";
import { cn } from "cn";

import {
  applicationFiltersToQuery,
  type ApplicationFilters,
  type ApplicationView,
} from "@/lib/validations/application-filters";

/**
 * Board / table toggle.
 *
 * Two links, not two buttons and not a stateful control. The view is in the
 * URL, so switching is a navigation — which means it is shareable, survives a
 * refresh, and works before any JavaScript has loaded. This whole component is
 * a Server Component for the same reason: there is nothing here to make
 * interactive.
 *
 * It deliberately does **not** write `User.defaultView`. Having a glance at the
 * board quietly change where you land every day afterwards is the kind of
 * helpfulness nobody asked for; the preference belongs in settings, where
 * changing it is the thing you came to do.
 */
export function ViewSwitch({
  filters,
  current,
}: {
  filters: ApplicationFilters;
  /** The resolved view — from the URL, or the user's preference. */
  current: ApplicationView;
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className="border-input bg-card inline-flex shrink-0 rounded-lg border p-0.5 shadow-xs"
    >
      <Option view="board" current={current} filters={filters} icon={Columns3} label="Board" />
      <Option view="table" current={current} filters={filters} icon={List} label="Table" />
    </div>
  );
}

function Option({
  view,
  current,
  filters,
  icon: Icon,
  label,
}: {
  view: ApplicationView;
  current: ApplicationView;
  filters: ApplicationFilters;
  icon: typeof List;
  label: string;
}) {
  const active = current === view;

  /*
   * Page 1, always. The board ignores pagination, so arriving from page 4 of
   * the table would otherwise put `page=4` back in the URL the moment the user
   * switched to the table again — on a filtered list that may now have one
   * page.
   */
  const query = applicationFiltersToQuery({ ...filters, view, page: 1 });

  return (
    <Link
      href={query ? `/applications?${query}` : "/applications"}
      aria-current={active ? "true" : undefined}
      className={cn(
        "focus-visible:ring-ring/40 inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Link>
  );
}
