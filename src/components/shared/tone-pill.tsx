import { cn } from "cn";

/**
 * The toned pill shared by every status-shaped label in the app.
 *
 * Extracted from `StatusBadge` when Phase 3 added two more of these — an
 * interview's result and an assessment's status — and will serve a task's
 * priority as well. The markup is identical in all four cases and only the colour
 * map differs, so this holds the shape and each domain owns its own tones next to
 * the labels they belong with.
 *
 * It is deliberately *not* the `Badge` primitive. `Badge` offers six semantic
 * variants from the token set; these need a per-value hue ramp that is wider than
 * the tokens carry, which is the whole reason `APPLICATION_STATUS_TONES` spells
 * out Tailwind palette classes by hand.
 *
 * Every tone must carry an explicit dark variant. A pill built from a light-mode
 * tint is unreadable on a slate-950 card, and this is the smallest text in the
 * product.
 */

export type Tone = {
  /** Background, border and text for the pill. */
  pill: string;
  /** The dot, which carries the hue at full strength. */
  dot: string;
};

export function TonePill({
  tone,
  children,
  className,
  showDot = true,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
  /**
   * The dot earns its place where a column of pills is scanned vertically — a
   * board heading, a table of statuses. On a single inline label it is noise, so
   * callers can drop it.
   */
  showDot?: boolean;
}) {
  return (
    <span
      data-slot="tone-pill"
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        tone.pill,
        className,
      )}
    >
      {showDot ? (
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      ) : null}
      {children}
    </span>
  );
}
