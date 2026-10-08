"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus } from "lucide-react";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";

/**
 * The notes on one application.
 *
 * **Inline rather than in a dialog**, which is the one place Phase 3 departs from
 * the dialog pattern the other entities use — and deliberately. A note is a single
 * textarea, it is the most frequent thing a user adds, and it is almost always
 * written while looking at something else on the page. A modal for one field would
 * cover the very thing being written about, and the two clicks to open and close it
 * are most of the work of adding a note at all.
 *
 * So this is a client component rather than a server one with client islands:
 * adding and editing both need local draft state, and splitting that across three
 * components to keep the list on the server would be more machinery than the list
 * is worth.
 *
 * **Dates arrive pre-formatted.** `createdLabel` is built on the server in
 * `User.timezone`, because `createdAt` is an instant and formatting it here would
 * either use the browser's zone — disagreeing with every other date on the page —
 * or cause a hydration mismatch. The server owns every conversion (§4).
 */

export type NoteItem = {
  id: string;
  content: string;
  /** Formatted on the server, in the user's timezone. */
  createdLabel: string;
  /** True when `updatedAt` has moved past `createdAt`. */
  edited: boolean;
};

export function DetailNotes({
  applicationId,
  notes,
}: {
  applicationId: string;
  notes: NoteItem[];
}) {
  const router = useRouter();

  /** The id being edited, `"new"` while composing, or null. */
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdding() {
    setActive("new");
    setDraft("");
    setError(null);
  }

  function startEditing(note: NoteItem) {
    setActive(note.id);
    setDraft(note.content);
    setError(null);
  }

  function cancel() {
    setActive(null);
    setDraft("");
    setError(null);
  }

  async function save() {
    const content = draft.trim();

    // Checked here as well as on the server so an accidental Save on an untouched
    // textarea is a no-op rather than a round trip that returns a field error.
    if (!content) {
      setError("A note needs some text.");

      return;
    }

    setIsSaving(true);
    setError(null);

    const isNew = active === "new";

    try {
      const response = await fetch(
        isNew ? `/api/applications/${applicationId}/notes` : `/api/notes/${active}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const { message } = await readApiError(
          response,
          isNew ? "Could not add that note." : "Could not save that note.",
        );

        setError(message);
        setIsSaving(false);

        return;
      }

      setActive(null);
      setDraft("");
      setIsSaving(false);

      toast.add({ type: "success", title: isNew ? "Note added" : "Note saved" });

      // The list is rendered from the server, which also owns the date formatting
      // and the ordering — a locally inserted note would have neither.
      router.refresh();
    } catch {
      setError("Check your connection and try again.");
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          Notes
          {notes.length > 0 ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal">{notes.length}</span>
          ) : null}
        </CardTitle>
        <CardDescription>
          Newest first — whatever you want to remember about this role.
        </CardDescription>

        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={startAdding}
            disabled={active === "new" || isSaving}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add note
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {active === "new" ? (
          <Composer
            draft={draft}
            onDraftChange={setDraft}
            onSave={() => void save()}
            onCancel={cancel}
            isSaving={isSaving}
            error={error}
            saveLabel="Add note"
            placeholder="Anything worth remembering — who you spoke to, what they said, what to do next."
          />
        ) : null}

        {notes.length === 0 && active !== "new" ? (
          <div className="text-muted-foreground flex items-center gap-2.5 py-2 text-sm">
            <NotebookPen aria-hidden="true" className="size-4 shrink-0" />
            No notes on this application yet.
          </div>
        ) : null}

        {notes.length > 0 ? (
          <ul className="flex flex-col">
            {notes.map((note) =>
              active === note.id ? (
                <li
                  key={note.id}
                  className="border-border border-b py-4 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <Composer
                    draft={draft}
                    onDraftChange={setDraft}
                    onSave={() => void save()}
                    onCancel={cancel}
                    isSaving={isSaving}
                    error={error}
                    saveLabel="Save note"
                  />
                </li>
              ) : (
                <li
                  key={note.id}
                  className="border-border flex items-start gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    {/*
                     * `whitespace-pre-line` so the paragraphs a user typed survive.
                     * React escapes the content, so a note is plain text and never
                     * markup — there is no `dangerouslySetInnerHTML` anywhere in
                     * this product (§8).
                     */}
                    <p className="text-[0.875rem] leading-relaxed whitespace-pre-line">
                      {note.content}
                    </p>

                    <p className="text-muted-foreground mt-2 text-xs">
                      {note.createdLabel}
                      {note.edited ? (
                        <span className="text-muted-foreground/70"> · edited</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEditing(note)}
                      disabled={isSaving}
                    >
                      <NotebookPen aria-hidden="true" />
                      <span className="sr-only">Edit this note</span>
                    </Button>

                    <ConfirmDelete
                      endpoint={`/api/notes/${note.id}`}
                      triggerLabel="Delete this note"
                      title="Delete this note?"
                      description="The note will be removed from this application. Nothing else changes."
                      successTitle="Note deleted"
                      failureMessage="Could not delete that note."
                    />
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The textarea, its buttons and its error — shared by the add and edit paths so
 * the two cannot drift in spacing or in which key does what.
 */
function Composer({
  draft,
  onDraftChange,
  onSave,
  onCancel,
  isSaving,
  error,
  saveLabel,
  placeholder,
}: {
  draft: string;
  onDraftChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
  saveLabel: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Textarea
        // Focused on mount, which is what makes "Add note" one click rather than
        // two. An attribute rather than an effect with a ref — the React Compiler
        // forbids writing a ref during render, and this needs no ref at all.
        autoFocus
        rows={4}
        value={draft}
        placeholder={placeholder}
        disabled={isSaving}
        aria-invalid={!!error || undefined}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter saves; Escape cancels. A bare Enter must insert a
          // newline — this is a multi-paragraph field, and the most common thing
          // typed into it is a second line.
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />

      {error ? (
        <p role="alert" className="text-destructive text-[0.8125rem] font-medium">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving…" : saveLabel}
        </Button>

        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>

        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          Ctrl + Enter to save
        </span>
      </div>
    </div>
  );
}
