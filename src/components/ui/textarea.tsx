import * as React from "react";
import { cn } from "cn";

/** Matches `Input` state for state — see that file for why the states differ. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground/90 selection:bg-primary/15 hover:border-ring/50 focus-visible:border-ring focus-visible:ring-ring/25 disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:bg-input/30 dark:disabled:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/30 flex field-sizing-content min-h-20 w-full rounded-lg border px-3 py-2.5 text-base shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:shadow-none aria-invalid:ring-3 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
