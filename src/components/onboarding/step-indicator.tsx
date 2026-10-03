import { Check } from "lucide-react";
import { cn } from "cn";

/**
 * The wizard's progress, as numbered steps with labels.
 *
 * It replaces three unlabelled bars, which showed how far along the user was
 * but never what was still coming — the question anyone part-way through a
 * signup form actually has. Completed steps collapse to a tick so the current
 * number is the only one competing for attention.
 *
 * Presentational by design: the step lives in the wizard's state, and this is
 * not a navigation control. Jumping back to step 1 from the indicator would
 * skip the per-step validation the wizard runs on the way forward, so moving
 * between steps stays with the Back and Continue buttons.
 *
 * Labels are hidden below `sm`, where three of them cannot sit on one line
 * without wrapping into noise. The numbered circles still read as progress, and
 * the card header names the step the user is on.
 */
export function StepIndicator({
  steps,
  current,
  className,
}: {
  steps: ReadonlyArray<string>;
  current: number;
  className?: string;
}) {
  return (
    <ol aria-label="Setup progress" className={cn("flex items-center gap-2.5", className)}>
      {steps.map((label, index) => {
        const isComplete = index < current;
        const isCurrent = index === current;

        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex flex-1 items-center gap-2.5 last:flex-none"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "font-heading flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold tabular-nums transition-colors",
                  isComplete && "bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary bg-card border-2 shadow-xs",
                  !isComplete && !isCurrent && "border-border text-muted-foreground bg-card border",
                )}
              >
                {isComplete ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Completed:</span>
                  </>
                ) : (
                  index + 1
                )}
              </span>

              <span
                className={cn(
                  "hidden text-[0.8125rem] whitespace-nowrap sm:inline",
                  isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>

            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px flex-1 transition-colors",
                  isComplete ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
