"use client";

import type { ReactNode } from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "cn";

/**
 * Transient confirmations, built on Base UI's toast.
 *
 * The product needs these before Phase 2 can land: "application created",
 * "status moved to Interview", and above all the ~10-second undo after a delete
 * (DESIGN.md §8) all depend on a toast that can carry an action button and stay
 * on screen long enough to be used.
 *
 * Two structural decisions worth knowing:
 *
 * 1. A module-scope `toastManager` is the one exported entry point, rather than
 *    making every caller reach for `useToastManager()`. Mutations in this app
 *    are fired from form actions and event handlers that are not always inside
 *    a component that can hold a hook, and a single manager means there is
 *    exactly one viewport no matter how many places queue a toast.
 *
 * 2. The variant comes from the toast's `type` field, read in JavaScript rather
 *    than matched with a `data-type` selector. The mapping is an explicit record
 *    below, so an unknown type degrades to the neutral style instead of
 *    rendering an unstyled box.
 *
 * Positioning is bottom-right on desktop and a full-width strip at the bottom
 * on mobile, where the right corner is under a thumb.
 */

export type ToastVariant = "success" | "error" | "info";

const VARIANTS: Record<ToastVariant, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleAlert, className: "text-destructive" },
  info: { icon: Info, className: "text-primary" },
};

function variantFor(type: string | undefined) {
  return type && type in VARIANTS ? VARIANTS[type as ToastVariant] : null;
}

/**
 * The global manager. Import this anywhere — including outside the React tree —
 * and call `toast.add({ title, description, type })`.
 */
export const toast = ToastPrimitive.createToastManager();

/**
 * The stacking and swipe choreography.
 *
 * Every custom property here is supplied by Base UI; the arithmetic turns them
 * into the collapsed-stack-that-fans-out-on-hover behaviour. `--peek` is how far
 * each toast behind the front one shows, and `--scale` is the slight recession
 * that sells the depth. The front toast's height is borrowed by the ones behind
 * it (`--toast-frontmost-height`) so a collapsed stack is one clean rectangle
 * rather than a ragged pile.
 *
 * The `::after` strip bridges the gap between stacked toasts, so moving the
 * pointer from one to the next doesn't leave the viewport and collapse the fan
 * mid-reach.
 */
const TOAST_ROOT_CLASSES = [
  "absolute right-0 bottom-0 left-auto w-full origin-bottom select-none",
  "[--gap:0.625rem] [--peek:0.6rem]",
  "[--scale:calc(max(0,1-(var(--toast-index)*0.06)))] [--shrink:calc(1-var(--scale))]",
  "[--height:var(--toast-frontmost-height,var(--toast-height))]",
  "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
  "z-[calc(1000-var(--toast-index))] h-[var(--height)] data-expanded:h-[var(--toast-height)]",
  "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
  "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
  "data-starting-style:[transform:translateY(calc(100%+2rem))]",
  "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(calc(100%+2rem))]",
  "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
  "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
  "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
  "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
  "data-ending-style:opacity-0 data-limited:opacity-0",
  "bg-card text-card-foreground border-border rounded-xl border shadow-lg",
  "focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
  "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
  "[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s,height_0.15s]",
  "motion-reduce:transition-none",
].join(" ");

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => {
    const variant = variantFor(item.type);
    const Icon = variant?.icon;

    return (
      <ToastPrimitive.Root key={item.id} toast={item} className={TOAST_ROOT_CLASSES}>
        <ToastPrimitive.Content className="flex items-start gap-3 overflow-hidden p-3.5 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100">
          {Icon ? (
            <Icon aria-hidden="true" className={cn("mt-px size-4.5 shrink-0", variant.className)} />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {item.title ? (
              <ToastPrimitive.Title className="text-[0.8125rem] leading-snug font-semibold" />
            ) : null}

            {item.description ? (
              <ToastPrimitive.Description className="text-muted-foreground text-[0.8125rem] leading-relaxed" />
            ) : null}

            {item.actionProps ? (
              <ToastPrimitive.Action className="text-primary focus-visible:ring-ring/40 mt-1.5 self-start text-[0.8125rem] font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:outline-none" />
            ) : null}
          </div>

          {/*
           * The dismiss control is an icon rather than a labelled button: a
           * toast is already the smallest surface in the product, and "Dismiss"
           * spelled out crowds out the message it is attached to. The accessible
           * name is on the aria-label instead.
           */}
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/40 -mt-0.5 -mr-0.5 flex size-7 shrink-0 cursor-default items-center justify-center rounded-md transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    );
  });
}

/**
 * Mount once, high in the tree. Wraps the app so the viewport outlives any
 * individual page — a toast queued by a mutation that navigates away must still
 * be readable after the new page renders.
 */
export function ToastViewport({ children }: { children?: ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toast}>
      {children}

      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-4 z-50 mx-auto w-auto sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-90">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
