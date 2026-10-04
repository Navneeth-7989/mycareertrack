import { cn } from "cn";

import { Card, CardContent } from "@/components/ui/card";

/**
 * One headline number on the dashboard.
 *
 * The `<dl>` lives inside the card rather than wrapping the grid: a definition
 * list only permits `dt`/`dd` as children or inside a single `div`, and a grid
 * of cards puts two elements between the two, which would be invalid markup.
 * One list per tile keeps the label-to-value relationship machine-readable
 * without that.
 *
 * `tabular-nums` is not cosmetic here — proportional digits change width as
 * counts tick over, which shifts the whole row every time a number changes.
 *
 * A value of "—" is styled muted. That state means "there is nothing to
 * measure yet" rather than "the answer is low", and rendering it at full
 * contrast next to real figures makes an absent metric look like a bad one.
 */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const absent = value === "—";

  return (
    <Card size="sm" className="gap-0">
      <CardContent>
        <dl>
          <dt className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
            {label}
          </dt>
          <dd
            className={cn(
              "font-heading mt-2 text-3xl leading-none font-semibold tabular-nums",
              absent && "text-muted-foreground",
            )}
          >
            {value}
          </dd>
        </dl>

        {hint ? <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
