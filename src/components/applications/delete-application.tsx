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
import { deletedApplicationSchema, type ApplicationSnapshot } from "@/lib/validations/application";

/**
 * Delete, with the cascade preview and the undo toast §8 asks for.
 *
 * The delete is real and immediate — see `deleteApplication` for why that was
 * chosen over holding the request or adding a `deletedAt` column. Undo is
 * therefore a genuine second operation: the response carries a snapshot, this
 * component hands it to the toast, and clicking Undo posts it back.
 *
 * The confirmation is not a formality. It names what else goes — the timeline,
 * the contact links — because §8 asks for a cascade preview and because "this
 * cannot be undone" is the one thing a dialog must never say when it can.
 */

/**
 * How long the undo stays on screen.
 *
 * §8 says "~10 seconds" and this is the ~. It is long enough to read the toast,
 * realise, and reach the button, and short enough that it is gone before the
 * user has moved on to something else and forgotten what it referred to.
 */
const UNDO_TIMEOUT_MS = 10_000;

export type DeletePreview = {
  events: number;
  contacts: number;
  interviews: number;
  assessments: number;
  notes: number;
  tasks: number;
};

export function DeleteApplication({
  id,
  jobTitle,
  companyName,
  preview,
}: {
  id: string;
  jobTitle: string;
  companyName: string;
  preview: DeletePreview;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function remove() {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/applications/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not delete that application.");

        toast.add({ type: "error", title: "Not deleted", description: message });
        setIsDeleting(false);

        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const parsed = deletedApplicationSchema.safeParse(body);

      setOpen(false);

      /*
       * Away from the page before the toast, because this application no longer
       * exists — staying would leave the user looking at a detail page whose
       * row is gone, and the next refresh would 404. `refresh()` as well, so the
       * list they land on is re-rendered from the server without the row rather
       * than served from the router cache with it.
       */
      router.push("/applications");
      router.refresh();

      toast.add({
        type: "success",
        title: "Application deleted",
        description: `${jobTitle} at ${companyName}`,
        timeout: UNDO_TIMEOUT_MS,
        /*
         * The action is omitted entirely when the snapshot could not be read.
         * A delete that succeeded on the server still succeeded, but offering
         * an Undo button that has nothing to send would be worse than offering
         * none — the user would click it, and nothing would come back.
         */
        ...(parsed.success
          ? {
              actionProps: {
                children: "Undo",
                onClick: () => void undo(parsed.data.data.snapshot),
              },
            }
          : {}),
      });
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
   * Runs from the toast, which outlives this component — the navigation above
   * unmounts it while the toast viewport sits in the app shell.
   *
   * So nothing here touches component state. It closes over `snapshot` and
   * `router`, both of which stay valid, and reports through the toast manager
   * rather than through a `setState` on something that is gone.
   */
  async function undo(snapshot: ApplicationSnapshot) {
    try {
      const response = await fetch(`/api/applications/${id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not restore that application.");

        toast.add({ type: "error", title: "Not restored", description: message });

        return;
      }

      toast.add({
        type: "success",
        title: "Application restored",
        description: `${jobTitle} at ${companyName}`,
      });

      // Back to the application, which is where the user was when they deleted
      // it. The ids were preserved, so this is the same address as before.
      router.push(`/applications/${id}`);
      router.refresh();
    } catch {
      toast.add({
        type: "error",
        title: "Not restored",
        description: "Check your connection and try again.",
      });
    }
  }

  const cascade = describeCascade(preview);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="destructive" render={<AlertDialogTrigger />}>
        <Trash2 aria-hidden="true" data-icon="inline-start" />
        Delete
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this application?</AlertDialogTitle>

          <AlertDialogDescription>
            <strong className="text-foreground font-medium">{jobTitle}</strong> at {companyName}
            {cascade ? ` will be removed, along with ${cascade}.` : " will be removed."} You will
            have a few seconds to undo it.
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

/**
 * The cascade, as a phrase: "4 timeline entries and 1 contact link".
 *
 * Only non-empty relations appear, so a freshly saved role with one event reads
 * as "along with 1 timeline entry" rather than listing five zeroes. An
 * application with nothing attached returns null and the sentence simply ends.
 *
 * "Contact link" rather than "contact", deliberately: the person is not deleted,
 * only their connection to this application. The distinction matters enough to
 * spend a word on, because a user who thinks deleting an application will erase
 * a recruiter's details may not delete it.
 */
function describeCascade(preview: DeletePreview): string | null {
  const parts = [
    count(preview.events, "timeline entry", "timeline entries"),
    count(preview.interviews, "interview", "interviews"),
    count(preview.assessments, "assessment", "assessments"),
    count(preview.notes, "note", "notes"),
    count(preview.tasks, "task", "tasks"),
    count(preview.contacts, "contact link", "contact links"),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  // "a, b and c" — an Oxford-comma-free list, because this sits inside a
  // sentence rather than in a bulleted preview.
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function count(value: number, singular: string, plural: string): string | null {
  return value === 0 ? null : `${value} ${value === 1 ? singular : plural}`;
}
