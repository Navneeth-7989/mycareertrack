import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A navigation destination the shell can reach but a later phase builds.
 *
 * Every link in the sidebar resolves to a real page from the moment the shell
 * ships. The alternative — eight items that 404, or items disabled until their
 * phase lands — makes the navigation itself untestable, and a disabled control
 * is the one thing a reviewer cannot tell apart from a broken one.
 *
 * So each of these states what the screen will hold and which block of work
 * brings it. `whatsComing` renders as badges rather than a bulleted list: this
 * is a claim about scope, not a feature list pretending to be documentation,
 * and badges read as labels instead of as promises.
 *
 * These are replaced wholesale, not extended — when the applications work
 * lands, `applications/page.tsx` stops importing this entirely.
 */
export function PlannedPage({
  title,
  description,
  icon: Icon,
  arrivesWith,
  whatsComing,
  actions,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Completes the sentence "Arrives with …". */
  arrivesWith: string;
  whatsComing: readonly string[];
  /**
   * For the half-built case: a section whose *page* is still planned but which
   * already has a working action elsewhere. `/applications` is the one — the
   * create form exists before the list that will show its results — and a
   * placeholder that hides a feature the user can already use is worse than no
   * placeholder at all.
   */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} description={description} actions={actions} />

      <Card className="py-0">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
          <span className="bg-accent text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" />
          </span>

          <div className="max-w-md">
            <p className="font-heading text-base font-semibold tracking-tight">
              Arrives with {arrivesWith}
            </p>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              This screen is reachable so the navigation around it is real, but nothing on it is
              wired up yet.
            </p>
          </div>

          <ul className="flex flex-wrap justify-center gap-2">
            {whatsComing.map((item) => (
              <li key={item}>
                <Badge variant="secondary">{item}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
