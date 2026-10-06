import Link from "next/link";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Restyled away from the shadcn defaults (see the design standard): the stock
 * scale tops out at 32px, which reads as a dense admin tool rather than the
 * product this is meant to look like.
 *
 * The scale here is 28 / 32 / 36 / 40 / 44px — `default` for in-app density,
 * `lg` to pair with the 40px form controls, `xl` for a page's single hero CTA.
 *
 * Focus uses an offset ring rather than an adjacent one: on a filled indigo
 * button an indigo ring drawn against the edge is invisible, so the gap is what
 * makes keyboard focus legible on every variant.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Mixed toward black rather than faded with an opacity step, so the
        // accent keeps its saturation on hover instead of washing out.
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-[color-mix(in_oklch,var(--primary),black_12%)] dark:hover:bg-[color-mix(in_oklch,var(--primary),white_10%)]",
        outline:
          "border-input bg-card text-foreground shadow-xs hover:border-input hover:bg-muted/70 aria-expanded:bg-muted dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // Tinted rather than filled: a solid red button is the loudest thing on
        // a page, and in this product destroying a row is never the main action.
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:ring-destructive/30 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xl: "h-11 gap-2 px-6 text-[0.9375rem] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/**
 * A link that looks like a button.
 *
 * This exists because `<Button render={<Link />}>` is wrong, and Base UI says
 * so out loud: *"A component that acts as a button expected a native <button>
 * because the `nativeButton` prop is true. Rendering a non-<button> removes
 * native button semantics."* Silencing it with `nativeButton={false}` would be
 * worse than the warning — it makes Base UI bolt `role="button"` and
 * Space-to-activate onto an anchor, so the element claims to be a button while
 * behaving like a link.
 *
 * A navigation is a link. It belongs in the tab order as a link, it opens in a
 * new tab on middle-click or Cmd-click, it has a copyable address, and Enter
 * activates it while Space scrolls the page. All of that is what `<a>` means,
 * and none of it survives being wrapped in button behaviour. So this is an
 * anchor wearing `buttonVariants`, with no button machinery at all.
 *
 * `disabled` is deliberately absent: there is no such thing on an anchor, and
 * the honest ways to express it — omit the link, or render a real disabled
 * `Button` — are both better than an anchor that looks dead but still
 * navigates. `Pagination` renders a disabled `Button` at the first and last
 * page for exactly that reason.
 */
function ButtonLink({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return (
    <Link
      data-slot="button-link"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, ButtonLink, buttonVariants };
