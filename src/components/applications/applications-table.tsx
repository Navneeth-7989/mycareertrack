import Link from "next/link";
import { CalendarClock, ChevronRight, MapPin } from "lucide-react";
import { cn } from "cn";

import { StatusCell } from "@/components/applications/status-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EMPLOYMENT_TYPE_LABELS,
  PRIORITY_LABELS,
  type ApplicationStatusValue,
  type PriorityValue,
} from "@/lib/constants/application";
import { WORK_MODE_LABELS, type WorkModeValue } from "@/lib/constants/work-mode";
import { formatDateOnly, todayAsDateOnly, toDateInputValue } from "@/lib/utils/date-only";
import type { ApplicationListItem } from "@/server/queries/applications";

/**
 * The applications list.
 *
 * Two presentations of the same rows: a table from `md` up, and a stack of
 * cards below it. Not a horizontally scrolling table on a phone — seven columns
 * in a 390px viewport means every row is read by swiping, and the column that
 * matters most (status) is the one off screen. The duplication is deliberate and
 * confined to layout; both read the same `ApplicationListItem` and the same
 * helpers below.
 *
 * Rows are links, not click handlers. A job application is a thing you open in
 * a new tab, middle-click, and copy the address of, and all of that comes free
 * from an anchor. The detail page arrives in a later step; until then these
 * point at `/applications/[id]`, which is why this is the step that stops
 * rendering a placeholder list.
 *
 * The status column is the one interactive cell: `StatusCell` is the same
 * dropdown the board cards carry, so an application can be moved from whichever
 * view the user happens to be in. The table gets no drag, though — rows are
 * ordered by whatever `sort` says, so there is no spatial meaning for a drop to
 * have. Everything else here stays a Server Component.
 */

export function ApplicationsTable({ items }: { items: ApplicationListItem[] }) {
  return (
    <>
      <TableContainer className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="group/row">
                <TableCell className="max-w-xs">
                  {/*
                   * The link wraps the role and company rather than the whole
                   * row: a `<td>` full of anchors would make every cell a
                   * separate tab stop, so one target per row keeps keyboard
                   * navigation sane.
                   */}
                  <Link
                    href={`/applications/${item.id}`}
                    className="focus-visible:ring-ring/40 block rounded-md focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <span className="block truncate font-medium">{item.jobTitle}</span>
                    <span className="text-muted-foreground block truncate text-[0.8125rem]">
                      {item.company.name}
                      {item.employmentType
                        ? ` · ${EMPLOYMENT_TYPE_LABELS[item.employmentType]}`
                        : ""}
                    </span>
                  </Link>
                </TableCell>

                <TableCell>
                  <StatusCell
                    id={item.id}
                    status={item.status}
                    jobTitle={item.jobTitle}
                    companyName={item.company.name}
                  />
                </TableCell>

                <TableCell className="text-muted-foreground max-w-40 text-[0.8125rem]">
                  <span className="block truncate">{locationLabel(item) ?? "—"}</span>
                </TableCell>

                <TableCell className="text-muted-foreground text-[0.8125rem] whitespace-nowrap">
                  {item.appliedAt ? formatDateOnly(item.appliedAt) : "—"}
                </TableCell>

                <TableCell className="text-[0.8125rem] whitespace-nowrap">
                  <DeadlineCell deadline={item.deadline} status={item.status} />
                </TableCell>

                <TableCell>
                  <PriorityMark priority={item.priority} />
                </TableCell>

                <TableCell className="text-right">
                  <ChevronRight
                    aria-hidden="true"
                    className="text-muted-foreground/60 group-hover/row:text-muted-foreground inline size-4 transition-colors"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ul className="divide-border divide-y md:hidden">
        {items.map((item) => (
          /*
           * The status pill is a sibling of the link, not inside it. A button
           * that opens a menu cannot live inside an anchor — it is invalid
           * markup, and in practice the tap either navigates or opens the menu
           * depending on where the finger landed. So the anchor takes the text
           * and the remaining width, and the pill sits beside it.
           */
          <li
            key={item.id}
            className="has-[a:hover]:bg-muted/45 flex items-start gap-3 px-5 py-4 transition-colors"
          >
            <Link
              href={`/applications/${item.id}`}
              className="focus-visible:ring-ring/40 flex min-w-0 flex-1 flex-col gap-2.5 rounded-md focus-visible:ring-3 focus-visible:outline-none"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.jobTitle}</p>
                <p className="text-muted-foreground truncate text-[0.8125rem]">
                  {item.company.name}
                </p>
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {locationLabel(item) ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin aria-hidden="true" className="size-3.5" />
                    <span className="truncate">{locationLabel(item)}</span>
                  </span>
                ) : null}

                {item.appliedAt ? <span>Applied {formatDateOnly(item.appliedAt)}</span> : null}

                {item.deadline ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock aria-hidden="true" className="size-3.5" />
                    <DeadlineCell deadline={item.deadline} status={item.status} />
                  </span>
                ) : null}
              </div>
            </Link>

            <StatusCell
              id={item.id}
              status={item.status}
              jobTitle={item.jobTitle}
              companyName={item.company.name}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Location and work mode in one line. "Remote" on its own is a location as far
 * as a reader is concerned, so a remote role with no city still has something
 * to show rather than an em dash.
 */
function locationLabel(item: {
  location: string | null;
  workMode: WorkModeValue | null;
}): string | null {
  const parts = [item.location, item.workMode ? WORK_MODE_LABELS[item.workMode] : null].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * A deadline, flagged when it has passed — §8 allows a past deadline and asks
 * for it to be visually marked rather than rejected.
 *
 * The flag is suppressed once an application has left the pipeline. A rejected
 * application whose deadline was last month is not an overdue task, and
 * colouring it red would put urgency on the one row where nothing can be done.
 */
function DeadlineCell({
  deadline,
  status,
}: {
  deadline: Date | null;
  status: ApplicationStatusValue;
}) {
  if (!deadline) {
    return <span className="text-muted-foreground">—</span>;
  }

  const closed = status === "REJECTED" || status === "WITHDRAWN" || status === "ACCEPTED";

  // Compared as date strings in the viewer's own calendar: "has this passed" is
  // a question about the user's today, not UTC's. See `utils/date-only`.
  const overdue = !closed && toDateInputValue(deadline) < todayAsDateOnly();

  return (
    <span
      className={cn(
        overdue ? "text-destructive font-medium" : "text-muted-foreground",
        "whitespace-nowrap",
      )}
    >
      {formatDateOnly(deadline)}
      {overdue ? " · past" : ""}
    </span>
  );
}

/**
 * Priority as a mark rather than a word.
 *
 * Medium is the column default, so nearly every row carries it — printing
 * "Medium" 20 times down a column adds no information and competes with the
 * status pill for attention. High earns a visible label, low a muted one, and
 * medium an em dash that says "nothing notable".
 */
function PriorityMark({ priority }: { priority: PriorityValue }) {
  if (priority === "MEDIUM") {
    return <span className="text-muted-foreground/70 text-[0.8125rem]">—</span>;
  }

  return (
    <span
      className={cn(
        "text-[0.8125rem] font-medium",
        priority === "HIGH" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
