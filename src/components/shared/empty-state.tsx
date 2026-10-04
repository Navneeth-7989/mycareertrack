import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

import { Card, CardContent } from "@/components/ui/card";

/**
 * The "nothing here yet" state, used on every list in the app.
 *
 * An empty state earns its space by saying what the screen is for and giving a
 * way to fill it, so `title` and `description` are both required and the action
 * slot sits directly under them. A bare "No results" centred in a card tells a
 * first-time user nothing about a product they have just signed up for.
 *
 * The icon is tinted rather than outlined in grey: it is the only colour in an
 * otherwise empty card, and a grey glyph on a white card reads as a disabled
 * control rather than an illustration.
 *
 * `variant="plain"` drops the card for cases where the caller already owns one
 * — a list card whose body is empty should not render a second border inside
 * its own.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  variant?: "card" | "plain";
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center",
        variant === "card" ? "px-6 py-12" : "px-2 py-8",
      )}
    >
      <span className="bg-accent text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon aria-hidden="true" className="size-5" />
      </span>

      <div className="max-w-sm">
        <p className="font-heading text-base font-semibold tracking-tight">{title}</p>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{description}</p>
      </div>

      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </div>
  );

  if (variant === "plain") {
    return <div className={className}>{body}</div>;
  }

  /*
   * `py-0` on the card and `px-0` on its content: the padding that centres the
   * block lives on `body` so both variants share one set of metrics. Leaving
   * the card's own 24px in place would stack two paddings and push the icon off
   * the optical centre.
   */
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="px-0">{body}</CardContent>
    </Card>
  );
}
