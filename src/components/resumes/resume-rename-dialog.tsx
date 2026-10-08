"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { PencilLine } from "lucide-react";

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
import { RESUME_LABEL_MAX } from "@/lib/constants/resume";
import { resumeRenameFormSchema, type ResumeRenameFormValues } from "@/lib/validations/resume";

/**
 * Renames one resume.
 *
 * A dialog for a single text field, which is more ceremony than a field normally
 * earns — but the alternative is editing in place on a row that also carries a
 * download link, a default control and a delete, and an input that appears among
 * those on click is the kind of surface where people type into the wrong thing.
 * The dialog also gets to say what a label is *for*, which is the part that is
 * not obvious: it names a version, not the file.
 *
 * The label is the only editable field. The file behind it never changes —
 * uploading a new version is an upload, not a rename, so that the old one stays
 * attached to the applications that were sent with it.
 */
export function ResumeRenameDialog({ resume }: { resume: { id: string; label: string } }) {
  const router = useRouter();
  const fieldId = useId();

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResumeRenameFormValues>({
    resolver: zodResolver(resumeRenameFormSchema),
    mode: "onTouched",
    defaultValues: { label: resume.label },
  });

  /**
   * Re-seeds on open, in the handler rather than an effect — the React
   * Compiler's `react-hooks/set-state-in-effect` rule. An abandoned rename must
   * not re-open showing the name the user walked away from.
   */
  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      reset({ label: resume.label });
    }

    setOpen(next);
  }

  async function save() {
    setFormError(null);

    try {
      const response = await fetch(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Raw values: the schema's input side is a string and the API
        // re-validates with the same schema (§4, rule 4).
        body: JSON.stringify(getValues()),
      });

      if (!response.ok) {
        const { message, fields } = await readApiError(response, "Could not rename that resume.");

        if (fields.label) {
          setError("label", { message: fields.label });
        } else {
          setFormError(message);
        }

        return;
      }

      setOpen(false);

      toast.add({
        type: "success",
        title: "Resume renamed",
        description: getValues("label"),
      });

      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  const onSubmit = handleSubmit(() => save());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button variant="ghost" size="icon-sm" render={<DialogTrigger />}>
        <PencilLine aria-hidden="true" />
        {/* Names the resume: several of these sit on one page. */}
        <span className="sr-only">Rename “{resume.label}”</span>
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename this resume</DialogTitle>

          <DialogDescription>
            The name is yours — the file keeps whatever it was called when you uploaded it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="mt-6">
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={!!errors.label}>
              <FieldLabel htmlFor={`${fieldId}-label`}>Name</FieldLabel>

              <Input
                id={`${fieldId}-label`}
                maxLength={RESUME_LABEL_MAX}
                autoComplete="off"
                autoFocus
                disabled={isSubmitting}
                aria-invalid={!!errors.label || undefined}
                {...register("label")}
              />

              {errors.label ? (
                <FieldError errors={[errors.label]} />
              ) : (
                <FieldDescription>
                  Something you will recognise in a list — “Frontend Resume”, “2026 — with
                  internship”.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isSubmitting}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
