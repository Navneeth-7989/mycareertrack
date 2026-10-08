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
import { deletedWithSnapshotSchema } from "@/lib/validations/snapshot";

/**
 * Confirm, then `DELETE` one row, then refresh — offering an undo where the
 * endpoint supports one.
 *
 * Phase 3 needs this six times — timeline entries, interviews, assessments,
 * notes, tasks and contact links — and all six are the same five steps: ask, send
 * a `DELETE`, report through a toast, close, re-render from the server. Six copies
 * would be six places for the error handling to drift, and the one that drifts
 * first is the one nobody is looking at.
 *
 * **Three of the six are recoverable**, and the `undo` prop is how they say so:
 * interviews, assessments and tasks each return a snapshot and accept it back at
 * `<endpoint>/restore`. The other three do not, which is a fact about the API
 * rather than a style choice — a timeline entry and a note are cheap to retype,
 * and unlinking a contact destroys nothing to begin with.
 *
 * The prop is a pair of strings rather than a schema or a callback, because this
 * is a client component rendered from *server* components: anything that is not
 * serialisable cannot cross that boundary. So the snapshot stays opaque here —
 * held as parsed-but-unexamined JSON and posted back verbatim — and the real
 * per-entity validation happens on the server, which is where it has to happen
 * anyway. See `deletedWithSnapshotSchema`.
 *
 * **Still deliberately not used for deleting an application.** That one navigates
 * away, names a cascade across six relations, and parses its snapshot in full.
 * Forcing it through this shape would mean props that only one caller ever sets,
 * which is how a shared component becomes worse than the duplication it replaced.
 * See `delete-application`.
 *
 * What stays the caller's decision is the *wording*. A dialog that says "Delete
 * this item?" is the kind of generic copy that makes people click without reading,
 * so the title and the description are required props and every caller writes a
 * sentence about the specific thing going away.
 */

/**
 * How long the undo stays on screen.
 *
 * The same ~10 seconds as `delete-application`, and deliberately the same
 * constant's worth of reasoning: long enough to read the toast, realise, and
 * reach the button, short enough that it is gone before the user has moved on and
 * forgotten what it referred to. Duplicated rather than shared because the two
 * components have no other reason to depend on each other, and a §8 number that
 * is allowed to differ per surface is not a number worth centralising.
 */
const UNDO_TIMEOUT_MS = 10_000;

export function ConfirmDelete({
  endpoint,
  title,
  description,
  triggerLabel,
  successTitle,
  successDescription,
  failureMessage,
  undo,
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
  /**
   * Set this when the `DELETE` returns a snapshot and `<endpoint>/restore`
   * accepts it back. Omit it and the delete is final, with no Undo offered —
   * which is the honest presentation for an endpoint that has no restore.
   */
  undo?: {
    /** The toast title after a successful restore, e.g. "Interview restored". */
    restoredTitle: string;
    /** Shown when the restore fails and the body has no message of ours. */
    failureMessage: string;
  };
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

      /*
       * Read before the toast is queued, because whether there is a snapshot
       * decides what kind of toast this is. The body is only looked at when the
       * caller said this endpoint returns one — the other three answer 204, and
       * reading them would be asking a question with no answer.
       *
       * When `undo` was asked for and the snapshot cannot be read, the action is
       * omitted rather than offered. The delete still succeeded on the server, so
       * the success toast is truthful — but an Undo button with nothing to send
       * would be a button that fails when clicked, which is worse than no button.
       */
      const snapshot = undo ? await readSnapshot(response) : null;

      toast.add({
        type: "success",
        title: successTitle,
        ...(successDescription ? { description: successDescription } : {}),
        ...(undo && snapshot
          ? {
              timeout: UNDO_TIMEOUT_MS,
              actionProps: {
                children: "Undo",
                onClick: () => void restore(snapshot, undo),
              },
            }
          : {}),
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

  /**
   * Runs from the toast, which outlives the row that queued it — `router.refresh()`
   * above re-renders the list without it, unmounting this component while the
   * toast viewport sits in the app shell.
   *
   * So nothing here touches component state. It closes over the snapshot, the
   * endpoint and `router`, all of which stay valid, and reports through the toast
   * manager rather than through a `setState` on something that is gone. The same
   * discipline as `delete-application`, for the same reason.
   */
  async function restore(
    snapshot: Record<string, unknown>,
    { restoredTitle, failureMessage: restoreFailureMessage }: NonNullable<typeof undo>,
  ) {
    try {
      const response = await fetch(`${endpoint}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, restoreFailureMessage);

        toast.add({ type: "error", title: "Not restored", description: message });

        return;
      }

      toast.add({
        type: "success",
        title: restoredTitle,
        ...(successDescription ? { description: successDescription } : {}),
      });

      router.refresh();
    } catch {
      toast.add({
        type: "error",
        title: "Not restored",
        description: "Check your connection and try again.",
      });
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

          {/*
           * The undo promise is appended here rather than written into every
           * caller's description, so the dialog cannot claim an undo the endpoint
           * does not offer — the same prop decides both.
           */}
          <AlertDialogDescription>
            {description}
            {undo ? " You will have a few seconds to undo it." : null}
          </AlertDialogDescription>
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

/**
 * The snapshot out of a delete response, or null when there isn't a readable one.
 *
 * Tolerant by design, and the one place in the app where parsing a body this
 * loosely is the right call. The client's only decision is whether to offer
 * Undo; it never reads a field of the snapshot, and the strict per-entity schema
 * runs on the server when the snapshot is posted back — which is the parse that
 * protects the database. Validating the shape twice would mean shipping three
 * snapshot schemas into this bundle to catch a response the server built from
 * its own columns a moment earlier.
 *
 * Null for a 204, for a body that is not JSON, and for one with no snapshot in
 * it. All three mean the same thing to the caller: no undo to offer.
 */
async function readSnapshot(response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = deletedWithSnapshotSchema.safeParse(body);

  return parsed.success ? parsed.data.data.snapshot : null;
}
