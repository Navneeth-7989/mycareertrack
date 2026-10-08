"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2, type LucideIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * Confirm, then `DELETE` one row, then refresh.
 *
 * Phase 3 needs this six times — timeline entries, interviews, assessments,
 * notes, tasks and contact links — and all six are the same five steps: ask, send
 * a `DELETE`, report through a toast, close, re-render from the server. Six copies
 * would be six places for the error handling to drift, and the one that drifts
 * first is the one nobody is looking at.
 *
 * **Deliberately not used for deleting an application.** That one is genuinely
 * different: it returns a snapshot, offers an undo, navigates away, and names a
 * cascade across six relations. Forcing it through this shape would mean adding
 * four props that only one caller ever sets, which is how a shared component
 * becomes worse than the duplication it replaced. See `delete-application`.
 *
 * What stays the caller's decision is the *wording*. A dialog that says "Delete
 * this item?" is the kind of generic copy that makes people click without reading,
 * so the title and the description are required props and every caller writes a
 * sentence about the specific thing going away.
 */
export function ConfirmDelete({
  endpoint,
  title,
  description,
  triggerLabel,
  successTitle,
  successDescription,
  failureMessage,
  confirmLabel = "Delete",
  keepLabel = "Keep it",
  trigger = "icon",
  icon: Icon = Trash2,
}: {
  /** The `DELETE` target, e.g. `/api/interviews/abc123`. */
  endpoint: string;
  title: string;
  description: ReactNode;
  /**
   * Names the thing on the trigger, for screen readers in `icon` mode and as the
   * visible text in `button` mode. Several of these can sit on one page, so
   * "Delete" alone would be heard identically for every row.
   */
  triggerLabel: string;
  successTitle: string;
  successDescription?: string;
  /** Shown when the response has no message of ours — a proxy error, a 502. */
  failureMessage: string;
  confirmLabel?: string;
  keepLabel?: string;
  trigger?: "icon" | "button";
  /**
   * Overrides the trash glyph. Unlinking a contact uses this: the row is being
   * detached rather than destroyed, and a bin would say the opposite of what the
   * dialog then has to spend a sentence correcting.
   */
  icon?: LucideIcon;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function remove() {
    setIsDeleting(true);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });

      if (!response.ok) {
        const { message } = await readApiError(response, failureMessage);

        toast.add({ type: "error", title: "Not deleted", description: message });
        setIsDeleting(false);

        return;
      }

      setOpen(false);

      toast.add({
        type: "success",
        title: successTitle,
        ...(successDescription ? { description: successDescription } : {}),
      });

      /*
       * The page stays. Every caller deletes something *on* the page rather than
       * the page's own subject, so re-rendering from the server is all that is
       * needed — and it also updates the counts and groupings that the row
       * belonged to, which a local state edit would miss.
       */
      router.refresh();
    } catch {
      toast.add({
        type: "error",
        title: "Not deleted",
        description: "Check your connection and try again.",
      });

      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger === "icon" ? (
        <Button variant="ghost" size="icon-sm" render={<AlertDialogTrigger />}>
          <Icon aria-hidden="true" />
          <span className="sr-only">{triggerLabel}</span>
        </Button>
      ) : (
        <Button variant="destructive" size="sm" render={<AlertDialogTrigger />}>
          <Icon aria-hidden="true" data-icon="inline-start" />
          {triggerLabel}
        </Button>
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button variant="outline" size="lg" render={<AlertDialogClose />} disabled={isDeleting}>
            {keepLabel}
          </Button>

          <Button
            variant="destructive"
            size="lg"
            onClick={() => void remove()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
