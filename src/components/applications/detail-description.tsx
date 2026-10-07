"use client";

import { useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The pasted job description.
 *
 * Collapsed by default past a few hundred words, which is the only reason this
 * is a client component. A job description is pasted, not typed — the real ones
 * run to two thousand words of benefits boilerplate, and an uncollapsed one
 * would make the page scroll for a minute to reach nothing. It sits last on the
 * page for the same reason: it is reference material, while the timeline above
 * it is the live state.
 *
 * Rendered as text, never as markup. `whitespace-pre-wrap` keeps the paragraph
 * breaks and bullet characters someone pasted from a careers page, and React's
 * own escaping is what makes it safe to show a field a user controls — nothing
 * here goes near `dangerouslySetInnerHTML`.
 */

/**
 * Where the clamp kicks in, in characters.
 *
 * Counted rather than measured. A line count would need the rendered height,
 * which means measuring in an effect and a frame where the page is laid out one
 * way and then another — and the clamp only has to be approximately right. At
 * roughly 90 characters a line this is about fifteen lines, which matches the
 * `max-h-80` below closely enough that the fade never appears over text that
 * was not actually cut.
 */
const COLLAPSE_THRESHOLD = 1400;

export function DetailDescription({ description }: { description: string }) {
  const collapsible = description.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  const collapsed = collapsible && !expanded;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Job description</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="relative">
          <div
            className={cn(
              // `break-words` because a pasted description reliably contains
              // one unbroken 80-character application URL, and without it that
              // single line sets the width of the whole column.
              "text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap",
              collapsed && "max-h-80 overflow-hidden",
            )}
          >
            {description}
          </div>

          {collapsed ? (
            /*
             * The fade is `from-card`, matching the surface it sits on, so the
             * text appears to run out rather than to be covered by a grey
             * rectangle. `pointer-events-none` keeps it from stealing a
             * selection drag over the last visible lines.
             */
            <div
              aria-hidden="true"
              className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent"
            />
          ) : null}
        </div>

        {collapsible ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 -ml-3"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Show full description"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
