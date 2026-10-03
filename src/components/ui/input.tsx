import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/**
 * 40px tall, white, with a slate-300 border — restyled from the stock 32px
 * transparent field (see the design standard).
 *
 * The three states are deliberately distinct: rest is a slate border, hover
 * warms it toward the accent to signal the field is live, and focus takes the
 * full indigo border plus a soft ring. A field whose hover and focus look the
 * same is the single most common reason a form feels unresponsive.
 *
 * `text-base md:text-sm` is not a typo — anything under 16px makes iOS Safari
 * zoom the viewport on focus, so the small size only applies from `md` up.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground/90 selection:bg-primary/15 hover:border-ring/50 focus-visible:border-ring focus-visible:ring-ring/25 disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:bg-input/30 dark:disabled:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/30 file:text-foreground h-10 w-full min-w-0 rounded-lg border px-3 py-1 text-base shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none aria-invalid:ring-3 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
