import { TonePill, type Tone } from "@/components/shared/tone-pill";
import { ASSESSMENT_STATUS_LABELS, type AssessmentStatusValue } from "@/lib/constants/assessment";

/**
 * Where an assessment stands.
 *
 * The hues match the application status scale on purpose — amber is "being
 * tested" there and "still to take" here, emerald is a good outcome in both — so
 * the two read as one system rather than two palettes.
 *
 * `PENDING` is amber rather than slate, which is the one place this scale is
 * louder than the interview-result one. The reason is that an untaken assessment
 * is a *task*: it has a deadline and it can be missed, where an interview with no
 * result yet is simply waiting on somebody else. The colour should say which of
 * those two things the row is.
 */
const ASSESSMENT_STATUS_TONES: Record<AssessmentStatusValue, Tone> = {
  PENDING: {
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  COMPLETED: {
    pill: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  PASSED: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  FAILED: {
    pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
  },
};

export function AssessmentStatusBadge({
  status,
  className,
}: {
  status: AssessmentStatusValue;
  className?: string;
}) {
  return (
    <TonePill tone={ASSESSMENT_STATUS_TONES[status]} className={className}>
      {ASSESSMENT_STATUS_LABELS[status]}
    </TonePill>
  );
}
