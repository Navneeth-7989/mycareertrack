"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

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
 * Removes one manual timeline entry.
 *
 * **Confirm first, no undo** — the opposite trade from deleting an application,
 * and deliberately so. That one deletes twenty fields and six relations, so it
 * returns a snapshot and offers ten seconds to change your mind. This deletes
 * four fields the user typed themselves, and the dialog quotes the entry's title
 * back so there is no doubt which one is going. Re-adding it is a click and a
 * sentence they still remember, which is cheaper than the restore endpoint an
 * undo would need.
 *
 * Only rendered for manual entries. The server refuses an automatic one with a
 * 409 regardless (see `assertEditable`), so this is the UI half of a rule that
 * holds on its own.
 */
export function DeleteEvent({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function remove() {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/events/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not delete that entry.");

        toast.add({ type: "error", title: "Not deleted", description: message });
        setIsDeleting(false);

        return;
      }

      setOpen(false);

      toast.add({ type: "success", title: "Entry deleted", description: title });

      /*
       * The page stays — unlike an application delete, the thing the user is
       * looking at still exists. `refresh()` re-renders the timeline from the
       * server without the row.
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
      <Button variant="ghost" size="icon-sm" render={<AlertDialogTrigger />}>
        <Trash2 aria-hidden="true" />
        {/* Names the entry, so several Delete buttons on one page are
            distinguishable to a screen reader. */}
        <span className="sr-only">Delete “{title}”</span>
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>

          <AlertDialogDescription>
            <strong className="text-foreground font-medium">{title}</strong> will be removed from
            this application&rsquo;s timeline. Nothing else about the application changes.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button variant="outline" size="lg" render={<AlertDialogClose />} disabled={isDeleting}>
            Keep it
          </Button>

          <Button
            variant="destructive"
            size="lg"
            onClick={() => void remove()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
