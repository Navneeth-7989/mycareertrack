"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { CompanyCombobox } from "@/components/applications/company-combobox";
import { StatusBadge } from "@/components/applications/status-badge";
import { EnumSelect, enumOptions, type EnumOption } from "@/components/form/enum-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_HINTS,
  APPLICATION_STATUS_LABELS,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  isSubmittedStatus,
  type ApplicationStatusValue,
} from "@/lib/constants/application";
import { WORK_MODES, WORK_MODE_LABELS } from "@/lib/constants/work-mode";
import { todayAsDateOnly } from "@/lib/utils/date-only";
import {
  EMPTY_APPLICATION_FORM,
  applicationWarningsSchema,
  createApplicationSchema,
  createdApplicationIdSchema,
  type ApplicationFormPayload,
  type ApplicationFormValues,
} from "@/lib/validations/application";
import type { ResumeOption } from "@/server/queries/resumes";

/**
 * The application form — create and edit both (DESIGN.md §7, Phase 2).
 *
 * One component for two screens, because they are the same twenty fields with
 * the same validation and the same layout. A second copy would be a second place
 * for the salary rules, the recruiter block and the duplicate dialog to drift,
 * and the first thing to go stale would be the one nobody is looking at.
 *
 * Passing `application` is what makes it an edit. Three things change, and only
 * three: the values it starts from, where it posts, and the fact that **status
 * becomes read-only** — a field edit must never be a second route to a column
 * whose change writes a timeline event and maintains `appliedAt` and
 * `firstResponseAt` in one transaction. Everything else is identical, which is
 * the point.
 *
 * Only company and job title are required, which is the whole design of the
 * create screen: §1 names "saving a posting you found 30 seconds ago" as the
 * most common action in the product, so the two fields that identify it come
 * first and everything else can be ignored. The sections below them are ordered
 * by how likely they are to be filled in, not by how the database is shaped.
 *
 * A near-identical application does not save on the first click. The server
 * answers 409 without writing anything, and the dialog at the bottom of this
 * file asks before the same request is re-sent with `acknowledgeDuplicate`.
 * Confirming is a second request, not a resumed one — there is no pending state
 * anywhere to go stale if the dialog is abandoned. On edit the question is only
 * ever asked when the edit *changed* the company or the title into a collision.
 *
 * It posts **raw form values** — `getValues()`, not the parsed payload
 * `handleSubmit` provides. The schema's input side is all strings and the API
 * re-validates with that same schema, so sending the parsed version means
 * posting a `Date` where "2026-03-14" is expected and having the server reject
 * its own output. This is the contract the onboarding wizard learned the hard
 * way; `tests/lib/application-validations.test.ts` keeps a tripwire on it.
 */

const STATUS_OPTIONS = enumOptions(
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_HINTS,
);
const PRIORITY_OPTIONS = enumOptions(PRIORITIES, PRIORITY_LABELS);
const SOURCE_OPTIONS = enumOptions(APPLICATION_SOURCES, APPLICATION_SOURCE_LABELS);
const WORK_MODE_OPTIONS = enumOptions(WORK_MODES, WORK_MODE_LABELS);
const EMPLOYMENT_TYPE_OPTIONS = enumOptions(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS);
const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({ value: code, label: code }));

/**
 * The resume picker's options.
 *
 * A function rather than a module constant like the five enums above, because
 * these come from the database and differ per user. The file name is the hint:
 * two versions can easily be labelled "Resume" and "Resume (new)", and the file
 * they were uploaded from is what distinguishes them.
 *
 * **"(deleted)" is appended here**, in the one place that renders a resume as a
 * choice, so a version whose file is gone cannot be mistaken for one that can
 * still be downloaded. `listResumeOptions` only ever marks the resume the
 * application already names — see its note for why that one has to be offered.
 */
function resumeChoices(resumes: ResumeOption[]): EnumOption[] {
  return resumes.map((resume) => ({
    value: resume.id,
    label: resume.isDeleted ? `${resume.label} (deleted)` : resume.label,
    hint: resume.fileName,
  }));
}

/**
 * The resume a new application should start on, or "" for none.
 *
 * A deleted resume is skipped even if it still carries the flag. `deleteResume`
 * clears `isDefault`, so this should be unreachable — but it is one `&&` to make
 * the create form structurally incapable of pre-selecting something the server
 * would then refuse.
 */
function defaultResumeId(resumes: ResumeOption[]): string {
  return resumes.find((resume) => resume.isDefault && !resume.isDeleted)?.id ?? "";
}

type FieldName = keyof ApplicationFormValues;

const FIELD_NAMES = Object.keys(EMPTY_APPLICATION_FORM) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}

/**
 * What the edit page passes. Its presence is what puts the form in edit mode —
 * one optional prop rather than a `mode` flag plus three fields that only mean
 * anything when it is set, which the compiler cannot police.
 */
export type ApplicationToEdit = {
  id: string;
  /** Every field, as strings — see `toApplicationFormValues`. */
  values: Required<ApplicationFormValues>;
  /**
   * How many *other* applications share the linked contact.
   *
   * Zero when there is no contact or it belongs to this application alone. Any
   * higher and the recruiter block says so before the user edits a record those
   * other applications also read.
   */
  otherApplicationsForContact: number;
};

export function ApplicationForm({
  application,
  resumeOptions = [],
}: {
  application?: ApplicationToEdit;
  /**
   * The user's resumes, for the picker in "What you sent".
   *
   * Fetched by the page rather than by this component, because it is a Server
   * Component's job — and because the edit page has to pass the application's
   * current id to `listResumeOptions` so that a resume deleted since it was sent
   * is still among the choices. Empty when the user has uploaded nothing, which
   * swaps the select for a link to `/resumes`.
   */
  resumeOptions?: ResumeOption[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = application !== undefined;

  /**
   * True from the moment the save succeeds until the browser has left the page.
   *
   * `isSubmitting` goes false the instant the fetch resolves, while the page it
   * navigates to can take a second to render — long enough for the button to
   * flip back to "Save application" and read as though the click did nothing.
   * The same fix as the onboarding wizard's `isLeaving`.
   */
  const [isLeaving, setIsLeaving] = useState(false);

  /**
   * The duplicate question, or null when there is nothing to ask.
   *
   * The message is held rather than recomputed, because it is the server's
   * sentence — it names the application already on file, which the client has
   * no way to know.
   */
  const [duplicateQuestion, setDuplicateQuestion] = useState<string | null>(null);

  /**
   * The confirm path runs outside `handleSubmit`, so `isSubmitting` is false
   * while it is in flight and the save button would look idle. This covers it.
   */
  const [isConfirming, setIsConfirming] = useState(false);

  // Three generics because the schema transforms: the form holds strings, the
  // submit callback would receive numbers and Dates. That callback ignores its
  // argument on purpose — see the note above about posting raw values.
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues, unknown, ApplicationFormPayload>({
    /*
     * `createApplicationSchema` in both modes, including the `status` field the
     * edit form never renders and never sends.
     *
     * That is not an oversight. The edit form still *holds* the stored status,
     * because it is what decides whether "date applied" belongs on screen — and
     * validating a value that came straight out of the database costs nothing
     * and can never fail. The alternative, a second resolver schema, would mean
     * two schemas to keep in step for one field that is read-only here anyway.
     */
    resolver: zodResolver(createApplicationSchema),
    mode: "onTouched",
    /*
     * On create the resume starts on the user's default, which is the entire
     * point of having one — most applications go out with the same version, and
     * a picker that always started blank would make recording it a chore people
     * skip. On edit the stored value wins, including a blank one: an application
     * logged before any resume existed must not acquire one because the user has
     * since set a default.
     */
    defaultValues: application?.values ?? {
      ...EMPTY_APPLICATION_FORM,
      resumeId: defaultResumeId(resumeOptions),
    },
  });

  const status = (useWatch({ control, name: "status" }) ??
    EMPTY_APPLICATION_FORM.status) as ApplicationStatusValue;

  // "Date applied" is meaningless for a role you have only saved, and offering
  // it would invite the contradiction the mutation would then have to resolve:
  // not applied, but applied on the 3rd. Hidden rather than disabled, because a
  // disabled field is indistinguishable from a broken one.
  //
  // On edit the same rule applies to the *stored* status, since this form has no
  // way to change it — so a saved role shows no date field, and the mutation
  // forces the column to null regardless of what arrives.
  const showAppliedAt = isSubmittedStatus(status);

  /**
   * Posts the form. `acknowledgeDuplicate` is false on the first attempt and
   * true only when the user has answered the confirmation.
   *
   * Written as one function called from two places — the submit handler and the
   * dialog's confirm button — so the retry is the *same* request with one field
   * flipped, rather than a second code path that could drift from the first.
   */
  async function save(acknowledgeDuplicate: boolean) {
    setFormError(null);

    const values = getValues();

    /*
     * `status` is dropped on edit, and the omission is the contract rather than
     * a tidy-up: `updateApplicationRequestSchema` has no such field, so sending
     * it would be sending something the endpoint cannot accept. Status moves
     * through its own endpoint, which writes a timeline event and maintains two
     * derived columns — none of which a field edit may skip.
     *
     * Set to `undefined` rather than destructured away, because `JSON.stringify`
     * omits undefined properties entirely: the key never reaches the wire, and
     * the line says which field is being withheld instead of leaving a discarded
     * binding for a reader to work out.
     */
    const response = await fetch(
      application ? `/api/applications/${application.id}` : "/api/applications",
      {
        method: application ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(application ? { status: undefined } : {}),
          acknowledgeDuplicate,
        }),
      },
    );

    if (!response.ok) {
      const { code, message, fields, confirmation } = await readApiError(response);

      // A near-identical application. Nothing was written — the server rolled
      // the whole transaction back — so asking and re-posting is safe.
      if (code === "CONFIRMATION_REQUIRED" && confirmation) {
        setDuplicateQuestion(confirmation.message);
        return;
      }

      const named = Object.entries(fields).filter(([name]) => isFieldName(name));

      for (const [name, fieldMessage] of named) {
        if (isFieldName(name)) {
          setError(name, { message: fieldMessage });
        }
      }

      // Only show the banner when nothing could be pinned to a field —
      // otherwise the same complaint appears twice, once inline and once at the
      // top, and the user fixes one and wonders about the other.
      if (named.length === 0) {
        setFormError(message);
      }

      return;
    }

    const body: unknown = await response.json().catch(() => null);

    toast.add({
      type: "success",
      title: application ? "Changes saved" : "Application saved",
      description: `${values.jobTitle} at ${values.companyName}`,
    });

    /*
     * The remaining advisories, as toasts. After an acknowledgement there is
     * nothing left to say — the user was just asked about that exact duplicate
     * and answered — so repeating it as a toast would be the app arguing with a
     * decision it had already accepted.
     *
     * What does still surface is the info level: another role at the same
     * company, which never reached a dialog. The toast stack lives outside the
     * page, so these survive the navigation below.
     *
     * Create only. An edit returns no advisories at all: `updateApplication`
     * runs the check solely to decide whether to *ask*, and only when the edit
     * changed the company or the title. "You have 3 other applications at
     * Google" is news the first time an application is logged and noise every
     * time one is corrected afterwards.
     */
    if (!acknowledgeDuplicate && !application) {
      for (const warning of applicationWarningsSchema.parse(body)) {
        toast.add({
          type: "info",
          title: "Worth knowing",
          description: warning.message,
        });
      }
    }

    setIsLeaving(true);

    if (application) {
      /*
       * Back to the application that was just edited. `refresh()` first,
       * because the detail page is a Server Component rendered from a cached
       * payload — navigating alone would land on the version that was fetched
       * before this save and show the user their old values as the confirmation
       * that their new ones were stored.
       */
      router.refresh();
      router.push(`/applications/${application.id}`);

      return;
    }

    /*
     * To the application that was just created, which is where the next thing
     * the user wants to do already is: read it back, correct a field, move the
     * status. It also confirms the save by showing the saved thing rather than
     * by showing a list and asking the user to find it.
     *
     * The list is the fallback when the id cannot be read — unfiltered, because
     * the default sort is newest first, so the new application is the top row.
     * Landing on a filtered view that happens to exclude it would be the worst
     * possible confirmation of a successful save.
     */
    const createdId = createdApplicationIdSchema.parse(body);

    router.push(createdId ? `/applications/${createdId}` : "/applications");
  }

  const onSubmit = handleSubmit(() => save(false));

  async function confirmDuplicate() {
    setDuplicateQuestion(null);
    setIsConfirming(true);

    try {
      await save(true);
    } finally {
      setIsConfirming(false);
    }
  }

  const busy = isSubmitting || isLeaving || isConfirming;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The role</CardTitle>
          <CardDescription>
            A company and a title are all you need. Everything else can wait.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.companyName}>
                <FieldLabel htmlFor="companyName">Company</FieldLabel>

                <Controller
                  control={control}
                  name="companyName"
                  render={({ field }) => (
                    <CompanyCombobox
                      id="companyName"
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      invalid={!!errors.companyName}
                      describedBy={errors.companyName ? "companyName-error" : undefined}
                      autoFocus
                      disabled={busy}
                    />
                  )}
                />

                <FieldError id="companyName-error" errors={[errors.companyName]} />
              </Field>

              <Field data-invalid={!!errors.jobTitle}>
                <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>

                <Input
                  id="jobTitle"
                  placeholder="SDE Intern"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.jobTitle || undefined}
                  aria-describedby={errors.jobTitle ? "jobTitle-error" : undefined}
                  {...register("jobTitle")}
                />

                <FieldError id="jobTitle-error" errors={[errors.jobTitle]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.jobUrl}>
              <FieldLabel htmlFor="jobUrl">Job posting link</FieldLabel>

              <Input
                id="jobUrl"
                inputMode="url"
                placeholder="careers.google.com/jobs/12345"
                autoComplete="off"
                disabled={busy}
                aria-invalid={!!errors.jobUrl || undefined}
                aria-describedby={errors.jobUrl ? "jobUrl-error" : "jobUrl-hint"}
                {...register("jobUrl")}
              />

              <FieldDescription id="jobUrl-hint">
                Postings disappear. Saving the link now is the difference between remembering what
                the role was and guessing.
              </FieldDescription>

              <FieldError id="jobUrl-error" errors={[errors.jobUrl]} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field data-invalid={!!errors.location}>
                <FieldLabel htmlFor="location">Location</FieldLabel>

                <Input
                  id="location"
                  placeholder="Bengaluru"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.location || undefined}
                  aria-describedby={errors.location ? "location-error" : undefined}
                  {...register("location")}
                />

                <FieldError id="location-error" errors={[errors.location]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="workMode">Work mode</FieldLabel>

                <Controller
                  control={control}
                  name="workMode"
                  render={({ field }) => (
                    <EnumSelect
                      id="workMode"
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={WORK_MODE_OPTIONS}
                      emptyLabel="Not specified"
                      disabled={busy}
                    />
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="employmentType">Employment type</FieldLabel>

                <Controller
                  control={control}
                  name="employmentType"
                  render={({ field }) => (
                    <EnumSelect
                      id="employmentType"
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={EMPLOYMENT_TYPE_OPTIONS}
                      emptyLabel="Not specified"
                      disabled={busy}
                    />
                  )}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Where it stands</CardTitle>
          <CardDescription>
            {isEdit
              ? "Status moves from the application page, so that every change is recorded on the timeline."
              : "The status drives the board, the pipeline and every rate on the analytics page."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>

                {/*
                 * Read-only on edit, and shown rather than hidden. Status is the
                 * most consequential thing about an application, so a form that
                 * simply omitted it would read as though editing had lost it —
                 * and the user would go looking. The badge answers "what is it"
                 * and the line beneath answers "then where do I change it",
                 * which is the pill on the detail page: the one control that
                 * writes a timeline event and maintains `appliedAt` and
                 * `firstResponseAt` in the same transaction.
                 */}
                {isEdit ? (
                  <div className="flex h-10 items-center">
                    <StatusBadge status={status} />
                  </div>
                ) : (
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <EnumSelect
                        id="status"
                        value={field.value ?? "SAVED"}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        options={STATUS_OPTIONS}
                        disabled={busy}
                      />
                    )}
                  />
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="priority">Priority</FieldLabel>

                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <EnumSelect
                      id="priority"
                      value={field.value ?? "MEDIUM"}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={PRIORITY_OPTIONS}
                      disabled={busy}
                    />
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="source">How you found it</FieldLabel>

                <Controller
                  control={control}
                  name="source"
                  render={({ field }) => (
                    <EnumSelect
                      id="source"
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={SOURCE_OPTIONS}
                      emptyLabel="Not specified"
                      disabled={busy}
                    />
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {showAppliedAt ? (
                <Field data-invalid={!!errors.appliedAt}>
                  <FieldLabel htmlFor="appliedAt">Date applied</FieldLabel>

                  <Input
                    id="appliedAt"
                    type="date"
                    max={todayAsDateOnly()}
                    disabled={busy}
                    aria-invalid={!!errors.appliedAt || undefined}
                    aria-describedby={errors.appliedAt ? "appliedAt-error" : "appliedAt-hint"}
                    {...register("appliedAt")}
                  />

                  <FieldDescription id="appliedAt-hint">
                    {/*
                     * Different promises, because the mutations genuinely
                     * differ. On create a blank date means "today". On edit it
                     * cannot mean null — the §3 invariant ties `appliedAt` to a
                     * submitted status, and this form cannot change status — so
                     * `nextAppliedAt` keeps what is stored.
                     */}
                    {isEdit
                      ? "Left blank, the current date is kept."
                      : "Left blank, today is used."}
                  </FieldDescription>

                  <FieldError id="appliedAt-error" errors={[errors.appliedAt]} />
                </Field>
              ) : null}

              <Field data-invalid={!!errors.deadline}>
                <FieldLabel htmlFor="deadline">Application deadline</FieldLabel>

                <Input
                  id="deadline"
                  type="date"
                  disabled={busy}
                  aria-invalid={!!errors.deadline || undefined}
                  aria-describedby={errors.deadline ? "deadline-error" : undefined}
                  {...register("deadline")}
                />

                <FieldError id="deadline-error" errors={[errors.deadline]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {/*
       * Its own card rather than a field in "Where it stands", because it is not
       * where the application stands — it is what left your hands. Placed
       * directly after the dates for the same reason: the resume and the date
       * applied are the two facts about the submission itself, and a year later
       * they are the two people actually come back for.
       */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What you sent</CardTitle>
          <CardDescription>
            {resumeOptions.length > 0
              ? "Which version of your resume went out, so you can tell later which one got the interview."
              : "Upload a resume and you can record which version went out with each application."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {resumeOptions.length === 0 ? (
            /*
             * A link rather than a disabled select. An empty dropdown is a dead
             * control that says nothing about why it is empty, and the fix is one
             * page away — so the card spends its space pointing there instead.
             */
            <ButtonLink variant="outline" href="/resumes">
              Upload a resume
            </ButtonLink>
          ) : (
            <FieldGroup>
              <Field data-invalid={!!errors.resumeId} className="sm:max-w-sm">
                <FieldLabel htmlFor="resumeId">Resume</FieldLabel>

                <Controller
                  control={control}
                  name="resumeId"
                  render={({ field }) => (
                    <EnumSelect
                      id="resumeId"
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={resumeChoices(resumeOptions)}
                      emptyLabel="Not recorded"
                      invalid={!!errors.resumeId}
                      describedBy={errors.resumeId ? "resumeId-error" : "resumeId-hint"}
                      disabled={busy}
                    />
                  )}
                />

                <FieldDescription id="resumeId-hint">
                  {/*
                   * Two different promises, because the two screens genuinely
                   * differ: a new application starts on the default, while an
                   * edit starts on whatever was stored — including a version
                   * since deleted, which stays selectable so that correcting a
                   * salary cannot quietly erase which resume was sent.
                   */}
                  {isEdit
                    ? "A version you have since deleted stays recorded here, marked as deleted."
                    : "Starts on your default resume. Change it if this application went out with a different version."}
                </FieldDescription>

                <FieldError id="resumeId-error" errors={[errors.resumeId]} />
              </Field>
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compensation and the posting</CardTitle>
          <CardDescription>
            Worth filling in if the posting states a range — it is what makes offers comparable
            later.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-[7rem_1fr_1fr]">
              <Field>
                <FieldLabel htmlFor="currency">Currency</FieldLabel>

                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <EnumSelect
                      id="currency"
                      value={field.value ?? "INR"}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={CURRENCY_OPTIONS}
                      disabled={busy}
                    />
                  )}
                />
              </Field>

              <Field data-invalid={!!errors.salaryMin}>
                <FieldLabel htmlFor="salaryMin">Salary from</FieldLabel>

                <Input
                  id="salaryMin"
                  inputMode="numeric"
                  placeholder="600000"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.salaryMin || undefined}
                  aria-describedby={errors.salaryMin ? "salaryMin-error" : undefined}
                  {...register("salaryMin")}
                />

                <FieldError id="salaryMin-error" errors={[errors.salaryMin]} />
              </Field>

              <Field data-invalid={!!errors.salaryMax}>
                <FieldLabel htmlFor="salaryMax">Salary to</FieldLabel>

                <Input
                  id="salaryMax"
                  inputMode="numeric"
                  placeholder="900000"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.salaryMax || undefined}
                  aria-describedby={errors.salaryMax ? "salaryMax-error" : undefined}
                  {...register("salaryMax")}
                />

                <FieldError id="salaryMax-error" errors={[errors.salaryMax]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.jobDescription}>
              <FieldLabel htmlFor="jobDescription">Job description</FieldLabel>

              <Textarea
                id="jobDescription"
                rows={6}
                placeholder="Paste the posting here while it still exists."
                disabled={busy}
                aria-invalid={!!errors.jobDescription || undefined}
                aria-describedby={errors.jobDescription ? "jobDescription-error" : undefined}
                {...register("jobDescription")}
              />

              <FieldError id="jobDescription-error" errors={[errors.jobDescription]} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recruiter or contact</CardTitle>
          <CardDescription>
            {isEdit
              ? "Clearing both the email and the phone unlinks this person from the application. Their contact record is kept."
              : "An email or a phone number saves this person to your contacts and links them to this application. A name on its own is not enough to reach anyone, so it saves nothing."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {/*
             * Shown before the inputs, not after, because it changes what the
             * user is about to do. A `Contact` is one row that several
             * applications point at, so editing it here reaches all of them —
             * which is the cost of being able to edit it at all, and is the kind
             * of thing someone should learn before they type rather than from a
             * toast afterwards.
             */}
            {application && application.otherApplicationsForContact > 0 ? (
              <Alert>
                <AlertDescription>
                  This person is also linked to{" "}
                  <strong className="font-medium">
                    {application.otherApplicationsForContact === 1
                      ? "one other application"
                      : `${application.otherApplicationsForContact} other applications`}
                  </strong>
                  . Changing their name, email or phone here updates the contact everywhere.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.recruiterName}>
                <FieldLabel htmlFor="recruiterName">Name</FieldLabel>

                <Input
                  id="recruiterName"
                  placeholder="Priya Sharma"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.recruiterName || undefined}
                  aria-describedby={errors.recruiterName ? "recruiterName-error" : undefined}
                  {...register("recruiterName")}
                />

                <FieldError id="recruiterName-error" errors={[errors.recruiterName]} />
              </Field>

              <Field data-invalid={!!errors.recruiterRole}>
                <FieldLabel htmlFor="recruiterRole">Their role here</FieldLabel>

                <Input
                  id="recruiterRole"
                  placeholder="HR, Hiring Manager, Referrer"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.recruiterRole || undefined}
                  aria-describedby={errors.recruiterRole ? "recruiterRole-error" : undefined}
                  {...register("recruiterRole")}
                />

                <FieldError id="recruiterRole-error" errors={[errors.recruiterRole]} />
              </Field>

              <Field data-invalid={!!errors.recruiterEmail}>
                <FieldLabel htmlFor="recruiterEmail">Email</FieldLabel>

                <Input
                  id="recruiterEmail"
                  type="email"
                  inputMode="email"
                  placeholder="priya@google.com"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.recruiterEmail || undefined}
                  aria-describedby={errors.recruiterEmail ? "recruiterEmail-error" : undefined}
                  {...register("recruiterEmail")}
                />

                <FieldError id="recruiterEmail-error" errors={[errors.recruiterEmail]} />
              </Field>

              <Field data-invalid={!!errors.recruiterPhone}>
                <FieldLabel htmlFor="recruiterPhone">Phone</FieldLabel>

                <Input
                  id="recruiterPhone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.recruiterPhone || undefined}
                  aria-describedby={errors.recruiterPhone ? "recruiterPhone-error" : undefined}
                  {...register("recruiterPhone")}
                />

                <FieldError id="recruiterPhone-error" errors={[errors.recruiterPhone]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {/*
       * Sticky, because this form is taller than a phone screen and a save
       * button at the bottom of four cards is a scroll away from wherever the
       * user finished typing.
       */}
      <div className="bg-background/85 sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {/*
         * `aria-disabled` and `pointer-events-none` rather than `disabled`,
         * which an anchor does not have — see `ButtonLink`. While a save is in
         * flight there is nothing to cancel anyway: the POST completes on the
         * server regardless of whether this page is still here.
         */}
        <ButtonLink
          variant="ghost"
          size="lg"
          // Back where the user came from: the application being edited, or the
          // list. Cancelling into a different screen than the one you opened the
          // form from reads as having been moved rather than having gone back.
          href={application ? `/applications/${application.id}` : "/applications"}
          aria-disabled={busy || undefined}
          className={busy ? "pointer-events-none opacity-50" : undefined}
        >
          Cancel
        </ButtonLink>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Save application"}
        </Button>
      </div>

      {/*
       * Controlled by whether there is a question to ask, rather than by a
       * trigger: the question comes from the server's answer to a submit, so
       * there is no element the user clicked to open this.
       */}
      <AlertDialog
        open={duplicateQuestion !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateQuestion(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isEdit
                ? "This now matches another application"
                : "You may have already applied to this"}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {duplicateQuestion}.{" "}
              {isEdit
                ? "Nothing has been changed yet — save anyway if these really are two separate applications."
                : "Nothing has been saved yet — save it anyway if this is a separate application."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {/*
             * Cancel returns to the form with every field still filled in, so
             * the way out of a mistaken duplicate is to edit the title rather
             * than to start again.
             */}
            <Button variant="outline" size="lg" render={<AlertDialogClose />}>
              Back to the form
            </Button>

            <Button size="lg" onClick={confirmDuplicate}>
              Save it anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
