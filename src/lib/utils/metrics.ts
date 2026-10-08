/**
 * How a metric is written down.
 *
 * Separate from `queries/analytics.ts` on purpose: that file owns what a number
 * *is*, this one owns how it reads. Keeping them apart is what lets the
 * arithmetic be unit-tested against hand counts without a string in sight.
 *
 * Nothing here invents a value for a missing one. `null` means "there is
 * nothing to measure", and every formatter returns an em dash for it — the same
 * convention `StatTile` already styles muted, so an absent metric never looks
 * like a bad one.
 */

/** The one place "nothing to measure" is spelled. */
export const ABSENT = "—";

/**
 * A rate as a whole percentage.
 *
 * Whole numbers throughout. A response rate of "37.5%" claims a precision that
 * eight applications cannot support, and the counts are printed beside every
 * rate on the page for anyone who wants the exact fraction.
 */
export function formatPercent(rate: number | null): string {
  if (rate === null) return ABSENT;

  return `${Math.round(rate * 100)}%`;
}

/**
 * A multiple, for the source comparison — "4.2×" below ten, "12×" above it.
 *
 * The decimal is dropped once the number is large because at that point the
 * tenth is noise, and "11.7× better" reads as a calculation where "12× better"
 * reads as a fact.
 */
export function formatMultiple(multiple: number): string {
  return `${multiple < 10 ? multiple.toFixed(1) : Math.round(multiple)}×`;
}

/**
 * A duration in days, as a reply time.
 *
 * "Same day" rather than "0.3 days", because that is what happened and nobody
 * measures a recruiter's reply in fractions of a day. Above that the unit is
 * days with one decimal, falling back to whole days past ten where the tenth
 * stops meaning anything.
 */
export function formatResponseDays(days: number | null): string {
  if (days === null) return ABSENT;
  if (days < 0.5) return "Same day";
  if (days < 1.5) return "1 day";

  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}
