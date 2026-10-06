import { cn } from "cn";

import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatusValue,
} from "@/lib/constants/application";

/**
 * The status pill.
 *
 * Nine statuses need nine readable tones, which is more hues than the token set
 * carries — `--success`, `--warning` and `--destructive` cover three of them.
 * So the scale is spelled out here against Tailwind's palette, chosen to sit
 * with the slate-and-azure system rather than beside it, and the file is the one
 * place it is defined: the Kanban board reads the same map for its column
 * headings, so a status can never be amber in a table and violet on a board.
 *
 * The scale is not arbitrary. It warms as an application progresses — slate for
 * a role you have only saved, azure once it is out, amber while you are being
 * tested, violet at interview, emerald at an offer — so a column of pills reads
 * as a temperature even before the words are read. The two endings break the
 * ramp on purpose: red stops, and withdrawn goes back to grey because it is an
 * absence of outcome rather than a bad one.
 *
 * Every tone carries an explicit dark variant. A pill built from a light-mode
 * tint is unreadable on a slate-950 card, and these are the smallest text in
 * the product.
 */

type Tone = {
  /** Background, border and text for the pill. */
  pill: string;
  /** The dot, which carries the hue at full strength. */
  dot: string;
};

export const APPLICATION_STATUS_TONES: Record<ApplicationStatusValue, Tone> = {
  SAVED: {
    pill: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  APPLIED: {
    pill: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  SCREENING: {
    pill: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  ASSESSMENT: {
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  INTERVIEW: {
    pill: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  OFFER: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  ACCEPTED: {
    // The one filled pill in the set. Accepting an offer is the outcome the
    // whole product exists for, and it should not look like another step.
    pill: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600",
    dot: "bg-white/80",
  },
  REJECTED: {
    pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  WITHDRAWN: {
    pill: "border-slate-200 bg-transparent text-slate-500 dark:border-slate-700 dark:text-slate-400",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatusValue;
  className?: string;
}) {
  const tone = APPLICATION_STATUS_TONES[status];

  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        tone.pill,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
