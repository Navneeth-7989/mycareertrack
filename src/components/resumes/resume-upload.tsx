"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import {
  RESUME_FILE_ACCEPT,
  RESUME_LABEL_MAX,
  RESUME_MAX_BYTES,
  resumeKindFromMime,
} from "@/lib/constants/resume";
import { formatFileSize } from "@/lib/utils/file-size";
import { deriveResumeLabel } from "@/lib/validations/resume";

/**
 * Upload a resume.
 *
 * **The one form in the app that is not React Hook Form**, and the reason is the
 * file input. A file field cannot be a controlled input — its value is set by the
 * browser's picker and is not assignable — so the register-and-validate machinery
 * every other form here uses would be managing one text field while the thing
 * that actually matters sat outside it. Two `useState`s and a `FormData` are the
 * honest shape, and they are what the endpoint wants anyway: this posts multipart,
 * not JSON, so there is no schema whose input side the values have to match.
 *
 * Validation still happens server-side and is still the authority — §6 requires
 * the MIME and magic-byte checks there, and `verifyResumeFile` is where a renamed
 * executable is caught. What the checks here buy is the round trip: refusing a
 * 40 MB video before uploading 40 MB of it is worth doing in the browser, and the
 * cap and the accepted types come from the same constants the server enforces, so
 * the two cannot disagree about what they want.
 *
 * The label is optional. Leaving it blank names the resume after the file, which
 * is what most people would have typed — so the field shows that name as its
 * placeholder rather than sitting empty and implying it is required.
 */
export function ResumeUpload() {
  const router = useRouter();
  const fieldId = useId();

  /**
   * Resets the native input, which `setFile(null)` cannot do on its own.
   *
   * A file input keeps its own `files` list, so clearing the React state while
   * the control still displays "cv.pdf" would leave the two disagreeing — and
   * re-picking the same file would then fire no change event.
   */
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Re-seeds on open, in the handler rather than an effect — the React
   * Compiler's `react-hooks/set-state-in-effect` rule. An abandoned upload must
   * not re-open still holding the file the user walked away from.
   */
  function onOpenChange(next: boolean) {
    if (next) {
      setFile(null);
      setLabel("");
      setFileError(null);
      setLabelError(null);
      setFormError(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }

    setOpen(next);
  }

  function onFileChange(chosen: File | null) {
    setFileError(null);
    setFormError(null);

    if (!chosen) {
      setFile(null);

      return;
    }

    /*
     * The same two questions the server asks, minus the one the browser cannot
     * answer: the content check needs the bytes, and reading 5 MB in the picker's
     * change handler to pre-empt an error the server will give anyway is work for
     * nothing. These two are free and save a pointless upload.
     */
    if (!resumeKindFromMime(chosen.type)) {
      setFile(null);
      setFileError("Only PDF and Word (.docx) files can be stored as a resume.");

      return;
    }

    if (chosen.size > RESUME_MAX_BYTES) {
      setFile(null);
      setFileError(
        `That file is ${formatFileSize(chosen.size)}. The limit is ${formatFileSize(RESUME_MAX_BYTES)}.`,
      );

      return;
    }

    setFile(chosen);
  }

  async function upload() {
    if (!file) {
      setFileError("Choose a PDF or Word document to upload");

      return;
    }

    setFormError(null);
    setLabelError(null);
    setIsUploading(true);

    try {
      const body = new FormData();

      body.set("file", file);
      // Sent only when typed. Blank means "name it after the file", which the
      // server does with the same `deriveResumeLabel` the placeholder shows.
      body.set("label", label.trim());

      // No `Content-Type` header: the browser has to set it, because only it
      // knows the multipart boundary it generated.
      const response = await fetch("/api/resumes", { method: "POST", body });

      if (!response.ok) {
        const { message, fields } = await readApiError(response, "Could not upload that resume.");

        let placed = false;

        if (fields.file) {
          setFileError(fields.file);
          placed = true;
        }

        if (fields.label) {
          setLabelError(fields.label);
          placed = true;
        }

        if (!placed) {
          setFormError(message);
        }

        setIsUploading(false);

        return;
      }

      setIsUploading(false);
      setOpen(false);

      toast.add({
        type: "success",
        title: "Resume uploaded",
        description: label.trim() || deriveResumeLabel(file.name),
      });

      // The list is ordered default-first and the first upload becomes the
      // default, so where this row lands is a server decision.
      router.refresh();
    } catch {
      setIsUploading(false);
      setFormError("Check your connection and try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * One trigger for both placements — the page header and the empty state —
       * like every other dialog in the app. A size that changed with where it
       * was rendered would make the same action look like two.
       */}
      <Button render={<DialogTrigger />}>
        <Upload aria-hidden="true" data-icon="inline-start" />
        Upload resume
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a resume</DialogTitle>

          <DialogDescription>
            PDF or Word, up to {formatFileSize(RESUME_MAX_BYTES)}. It is stored privately — only you
            can download it, through a link that expires.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={!!fileError}>
              <FieldLabel htmlFor={`${fieldId}-file`}>File</FieldLabel>

              {/*
               * Styled to sit beside `Input` rather than left as the browser
               * default, which is a grey button and a filename in whatever font
               * the platform picked — the one control that would have given away
               * that this dialog was assembled rather than designed. The file
               * button itself is reachable only through `::file-selector-button`.
               */}
              <input
                ref={inputRef}
                id={`${fieldId}-file`}
                type="file"
                accept={RESUME_FILE_ACCEPT}
                disabled={isUploading}
                aria-invalid={!!fileError || undefined}
                aria-describedby={fileError ? undefined : `${fieldId}-file-hint`}
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                className="border-input bg-card text-foreground file:text-foreground focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:bg-input/30 flex h-10 w-full items-center rounded-lg border bg-clip-padding pr-3 text-sm shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none file:mr-3 file:h-10 file:cursor-pointer file:rounded-l-lg file:border-0 file:border-r file:border-solid file:border-r-[var(--color-border)] file:bg-[var(--color-muted)] file:px-3.5 file:py-0 file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3"
              />

              {fileError ? (
                <FieldError>{fileError}</FieldError>
              ) : (
                <FieldDescription id={`${fieldId}-file-hint`}>
                  {file
                    ? `${file.name} · ${formatFileSize(file.size)}`
                    : "The file is checked on the server before it is stored."}
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={!!labelError}>
              <FieldLabel htmlFor={`${fieldId}-label`}>Name this version</FieldLabel>

              <Input
                id={`${fieldId}-label`}
                value={label}
                maxLength={RESUME_LABEL_MAX}
                autoComplete="off"
                disabled={isUploading}
                // The placeholder is the actual default, not an example — so
                // leaving the field alone does visibly what the hint promises.
                placeholder={file ? deriveResumeLabel(file.name) : "Frontend Resume"}
                aria-invalid={!!labelError || undefined}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setLabelError(null);
                }}
              />

              {labelError ? (
                <FieldError>{labelError}</FieldError>
              ) : (
                <FieldDescription>
                  Optional. Left blank, it is named after the file — useful once you are keeping a
                  frontend version and a backend one.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isUploading}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={isUploading || !file}>
              {isUploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
