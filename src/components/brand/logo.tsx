import { cn } from "cn";

/**
 * The CareerTrack mark and wordmark.
 *
 * The glyph is three ascending bars — an application moving through stages,
 * which is the whole product — drawn as a single flat shape rather than a
 * gradient badge. It is the only place the accent appears in page chrome, which
 * is what lets the primary button stay the loudest thing on a screen.
 *
 * Deliberately not a link: the destination differs by context (the landing page
 * points at /, the app shell will point at /dashboard), so callers wrap it.
 */
const MARK_SIZES = {
  sm: "size-7 rounded-[0.5rem] [&>svg]:size-4",
  md: "size-9 rounded-[0.625rem] [&>svg]:size-5",
  lg: "size-11 rounded-xl [&>svg]:size-6",
} as const;

const WORDMARK_SIZES = {
  sm: "text-sm",
  md: "text-[0.9375rem]",
  lg: "text-lg",
} as const;

type LogoSize = keyof typeof MARK_SIZES;

export function LogoMark({ size = "md", className }: { size?: LogoSize; className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex shrink-0 items-center justify-center shadow-xs",
        MARK_SIZES[size],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-current">
        <rect x="3" y="14" width="4.5" height="7" rx="1.6" opacity="0.5" />
        <rect x="9.75" y="9" width="4.5" height="12" rx="1.6" opacity="0.75" />
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.6" />
      </svg>
    </span>
  );
}

export function Logo({ size = "md", className }: { size?: LogoSize; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          "font-heading leading-none font-semibold tracking-[-0.01em]",
          WORDMARK_SIZES[size],
        )}
      >
        CareerTrack
      </span>
    </span>
  );
}
