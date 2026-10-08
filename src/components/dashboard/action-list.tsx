import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * One of the dashboard's three action lists.
 *
 * Generic over its rows rather than three near-identical cards, because the three differ
 * only in what each row says — a time, a deadline, a due date. Every other decision
 * (heading, count, the link out, the empty line, the "and N more" footer) is the same in
 * all three and is the part that would drift if copied.
 *
 * **Deliberately not the row components from the feature folders.** `InterviewRow` and
 * friends carry edit and delete controls, prep notes and result badges — correct on a
 * page devoted to them, and far too much for a dashboard whose job is to say "this
 * exists, go and look". So a row here is a line of text and a link, and nothing on this
 * card mutates anything.
 */

export type ActionItem = {
  id: string;
  /** The thing itself: a round's type, an assessment's name, a task's title. */
  title: string;
  /** When: "Tomorrow, 3:30 pm", "Due today", "Overdue · 2 Oct 2026". */
  when: string;
  /** True when `when` should read as a warning — overdue, or past a deadline. */
  urgent?: boolean;
  /** The application it belongs to, if any. Tasks can stand alone (§3). */
  context?: string;
  /** Where the row goes. A task with no application has nowhere to send the user. */
  href?: string;
};

export function ActionList({
  title,
  description,
  icon: Icon,
  items,
  total,
  emptyMessage,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items: ActionItem[];
  /**
   * The whole set, which may exceed what `items` holds — the card shows the first few
   * and says how many were left out.
   */
  total?: number;
  emptyMessage: string;
  viewAllHref: string;
  viewAllLabel: string;
}) {
  const hidden = total !== undefined ? Math.max(0, total - items.length) : 0;

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>

        <CardAction>
          <Link
            href={viewAllHref}
            className="text-muted-foreground hover:text-primary focus-visible:ring-ring/40 inline-flex items-center gap-1 rounded-sm text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
          >
            {viewAllLabel}
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-primary block truncate text-[0.875rem] font-medium underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="truncate text-[0.875rem] font-medium">{item.title}</p>
                )}

                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                  <span
                    className={
                      item.urgent ? "text-destructive font-medium" : "text-muted-foreground"
                    }
                  >
                    {item.when}
                  </span>

                  {item.context ? (
                    <>
                      <span aria-hidden="true" className="text-muted-foreground/60">
                        ·
                      </span>
                      <span className="text-muted-foreground truncate">{item.context}</span>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}

        {hidden > 0 ? (
          <p className="text-muted-foreground mt-3 text-xs">and {hidden} more</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
