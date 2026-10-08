"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "cn";

/**
 * A modal that holds a form.
 *
 * The counterpart to `alert-dialog`, and the difference is the whole reason both
 * exist. An alert dialog asks a question the user must answer, so it refuses to
 * be dismissed by a click outside — resolving "delete this?" as "whatever
 * happened to be focused" is not acceptable. This one is a surface the user
 * opened and may close: Escape and an outside click both work, and there is a
 * visible close button, because abandoning a form is a normal thing to do and
 * trapping someone in one is hostile.
 *
 * The styling is deliberately identical to the alert dialog's — same radius,
 * same elevation, same backdrop, same phone-anchored slide-up. They appear in
 * the same flows, sometimes one from the other, and any visual difference would
 * read as two unrelated systems rather than two behaviours of one.
 */

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-150",
          "dark:bg-slate-950/55",
        )}
      />

      {/*
       * `Viewport` is what makes a tall form scroll inside the dialog rather than
       * pushing its own footer off the bottom of a phone screen — the failure
       * mode of every hand-rolled centred modal.
       */}
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "bg-card text-card-foreground border-border relative my-auto w-full max-w-lg rounded-xl border bg-clip-padding p-6 shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-150",
            // Slides up from the bottom edge on a phone, where the dialog is
            // anchored to the bottom rather than centred.
            "data-ending-style:translate-y-4 data-starting-style:translate-y-4 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-y-0",
            "motion-reduce:animate-none motion-reduce:transition-none",
            className,
          )}
          {...props}
        >
          {children}

          {showCloseButton ? (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              // Positioned rather than placed in the header, so a long title
              // wraps under it instead of colliding with it. The hit area is 32px
              // while the glyph is 16px, which is the smallest comfortable target
              // that does not visually shout.
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/40 focus-visible:ring-offset-background absolute top-4 right-4 flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-offset-2"
            >
              <XIcon aria-hidden="true" className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // `pr-8` leaves room for the close button above, so a two-line title does
      // not run under it.
      className={cn("flex flex-col gap-2 pr-8", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * Actions stack in reverse on a phone — the confirming action on top, where a
 * thumb rests — and sit right-aligned with cancel first on desktop, matching the
 * form footers elsewhere in the app.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
