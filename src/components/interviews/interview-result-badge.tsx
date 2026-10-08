import { TonePill, type Tone } from "@/components/shared/tone-pill";
import { INTERVIEW_RESULT_LABELS, type InterviewResultValue } from "@/lib/constants/interview";

/**
 * How a round ended.
 *
 * The tones follow the same logic as `APPLICATION_STATUS_TONES` and reuse its
 * hues deliberately, so a violet-ish "interview" world and an emerald "passed"
 * read consistently across the two scales rather than as two palettes.
 *
 * `PENDING` is the quiet one. It is the default on every scheduled round, so it
 * appears more often than the other three combined — a saturated pill on every
 * upcoming interview would make the list shout about the one thing the user
 * already knows, which is that they have not heard yet.
 */
const INTERVIEW_RESULT_TONES: Record<InterviewResultValue, Tone> = {
  PENDING: {
    pill: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  PASSED: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  FAILED: {
    pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  CANCELLED: {
    // Transparent, like WITHDRAWN on the status scale: a cancelled round is an
    // absence of outcome rather than a bad one.
    pill: "border-slate-200 bg-transparent text-slate-500 dark:border-slate-700 dark:text-slate-400",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

export function InterviewResultBadge({
  result,
  className,
}: {
  result: InterviewResultValue;
  className?: string;
}) {
  return (
    <TonePill tone={INTERVIEW_RESULT_TONES[result]} className={className}>
      {INTERVIEW_RESULT_LABELS[result]}
    </TonePill>
  );
}
