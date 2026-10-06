"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "cn";

/**
 * A modal that interrupts to ask a question the user must answer.
 *
 * Deliberately an *alert* dialog rather than a plain one: it cannot be
 * dismissed by clicking outside or pressing Escape into nothing, because every
 * use here is a fork in a flow the user started — confirm a possible duplicate,
 * confirm a delete that cascades. A stray click outside resolving the question
 * as "no" would be fine; resolving it as "whatever happened to be focused" is
 * not.
 *
 * The parts are Base UI's with this app's surface styling. `Viewport` is what
 * makes a tall body scroll inside the dialog instead of pushing the buttons off
 * a phone screen.
 */

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogClose = AlertDialogPrimitive.Close;

function AlertDialogContent({ className, children, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-150",
          "dark:bg-slate-950/55",
        )}
      />

      <AlertDialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6">
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
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
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("font-heading text-base font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * Actions stack in reverse on a phone — the confirming action on top, where a
 * thumb rests — and sit right-aligned with cancel first on desktop, matching
 * the form footers elsewhere in the app.
 */
function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
