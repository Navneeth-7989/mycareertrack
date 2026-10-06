"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { CompanyCombobox } from "@/components/applications/company-combobox";
import { EnumSelect, enumOptions } from "@/components/form/enum-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  type ApplicationFormValues,
  type CreateApplicationPayload,
} from "@/lib/validations/application";

/**
 * The application create form (DESIGN.md §7, Phase 2).
 *
 * Only company and job title are required, which is the whole design of this
 * screen: §1 names "saving a posting you found 30 seconds ago" as the most
 * common action in the product, so the two fields that identify it come first
 * and everything else can be ignored. The sections below them are ordered by
 * how likely they are to be filled in, not by how the database is shaped.
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

type FieldName = keyof ApplicationFormValues;

const FIELD_NAMES = Object.keys(EMPTY_APPLICATION_FORM) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}

export function ApplicationForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * True from the moment the save succeeds until the browser has left the page.
   *
   * `isSubmitting` goes false the instant the fetch resolves, while the page it
   * navigates to can take a second to render — long enough for the button to
   * flip back to "Save application" and read as though the click did nothing.
   * The same fix as the onboarding wizard's `isLeaving`.
   */
  const [isLeaving, setIsLeaving] = useState(false);

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
  } = useForm<ApplicationFormValues, unknown, CreateApplicationPayload>({
    resolver: zodResolver(createApplicationSchema),
    mode: "onTouched",
    defaultValues: EMPTY_APPLICATION_FORM,
  });

  const status = (useWatch({ control, name: "status" }) ??
    EMPTY_APPLICATION_FORM.status) as ApplicationStatusValue;

  // "Date applied" is meaningless for a role you have only saved, and offering
  // it would invite the contradiction the mutation would then have to resolve:
  // not applied, but applied on the 3rd. Hidden rather than disabled, because a
  // disabled field is indistinguishable from a broken one.
  const showAppliedAt = isSubmittedStatus(status);

  const onSubmit = handleSubmit(async () => {
    setFormError(null);

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getValues()),
    });

    if (!response.ok) {
      const { message, fields } = await readApiError(response);
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
    const values = getValues();

    toast.add({
      type: "success",
      title: "Application saved",
      description: `${values.jobTitle} at ${values.companyName}`,
    });

    // The duplicate advisory, as a second toast rather than a dialog: the write
    // already succeeded, so there is nothing to confirm or cancel (§6 — never a
    // block). The toast stack is outside the page, so both survive the
    // navigation that follows.
    for (const warning of applicationWarningsSchema.parse(body)) {
      toast.add({
        type: "info",
        title: warning.level === "warning" ? "Possible duplicate" : "Worth knowing",
        description: warning.message,
      });
    }

    setIsLeaving(true);

    // TODO(step-3): go to the new application's row in the list, and then to
    // its detail page once that exists. The dashboard is the honest destination
    // while neither does — its counts move, which is visible proof the save
    // landed.
    router.push("/dashboard");
  });

  const busy = isSubmitting || isLeaving;

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
            The status drives the board, the pipeline and every rate on the analytics page.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>

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
                    Left blank, today is used.
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
            An email or a phone number saves this person to your contacts and links them to this
            application. A name on its own is not enough to reach anyone, so it saves nothing.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
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
        <Button variant="ghost" size="lg" disabled={busy} render={<Link href="/dashboard" />}>
          Cancel
        </Button>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save application"}
        </Button>
      </div>
    </form>
  );
}
