import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The heading block every page in the shell opens with.
 *
 * Centralised because the type scale only reads as a system if it is identical
 * everywhere: one 24px semibold `<h1>` with tightened tracking, one 14px muted
 * line under it, and page actions pinned to the baseline of the heading on
 * desktop. Hand-rolling this per page is how six screens end up with five
 * heading sizes.
 *
 * `actions` stacks under the text on narrow screens rather than squeezing
 * beside it — a 44px button next to a wrapping two-line title is the layout
 * that breaks first on a phone.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>

        {description ? (
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
