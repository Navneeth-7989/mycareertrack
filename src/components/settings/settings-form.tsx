"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { EnumSelect, enumOptions } from "@/components/form/enum-select";
import { SearchableSelect } from "@/components/form/searchable-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import {
  NOTIFICATION_PREFERENCE_COPY,
  REMINDER_HOURS_LABELS,
  REMINDER_HOUR_OPTIONS,
  VIEW_PREFERENCES,
  VIEW_PREFERENCE_HINTS,
  VIEW_PREFERENCE_LABELS,
  type NotificationPreferenceKey,
} from "@/lib/constants/notification";
import { TIMEZONES } from "@/lib/constants/timezones";
import {
  settingsSchema,
  type SettingsFormValues,
  type SettingsPayload,
} from "@/lib/validations/settings";

/**
 * The settings form — the four reminder toggles, the reminder window, the
 * default applications view, and the timezone.
 *
 * **One form and one save, not seven autosaving switches.** Autosave would need
 * seven in-flight states, seven rollbacks and a toast per click; and three of
 * these fields change what the rest of the app does — turning a reminder off
 * while the next page load generates one is a race worth not having. A single
 * explicit save is also the pattern every other form in this app uses, which is
 * most of why it is the right answer here.
 *
 * It posts **raw form values**, `getValues()` rather than the payload
 * `handleSubmit` produces. `settingsSchema`'s `reminderHours` has a string input
 * side and the API re-validates with the same schema, so posting the parsed
 * version would send `24` where `"24"` is expected and have the server reject
 * its own output — the contract the onboarding wizard learned the hard way.
 * `tests/lib/settings-validations.test.ts` keeps a tripwire on it.
 */

const REMINDER_OPTIONS = enumOptions(
  REMINDER_HOUR_OPTIONS.map(String) as [string, ...string[]],
  Object.fromEntries(
    REMINDER_HOUR_OPTIONS.map((hours) => [String(hours), REMINDER_HOURS_LABELS[hours]]),
  ),
);

const VIEW_OPTIONS = enumOptions(VIEW_PREFERENCES, VIEW_PREFERENCE_LABELS, VIEW_PREFERENCE_HINTS);

const PREFERENCE_KEYS = Object.keys(NOTIFICATION_PREFERENCE_COPY) as NotificationPreferenceKey[];

export function SettingsForm({ settings }: { settings: SettingsFormValues }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsFormValues, unknown, SettingsPayload>({
    resolver: zodResolver(settingsSchema),
    mode: "onTouched",
    defaultValues: settings,
  });

  async function save() {
    setFormError(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getValues()),
      });

      if (!response.ok) {
        const { message, fields } = await readApiError(response, "Could not save your settings.");

        for (const [name, error] of Object.entries(fields)) {
          setError(name as keyof SettingsFormValues, { message: error });
        }

        setFormError(Object.keys(fields).length > 0 ? null : message);

        return;
      }

      /*
       * Re-seeded from what was sent, which is what clears `isDirty` so the
       * Save button goes back to disabled. Reading the response body instead
       * would mean mapping stored columns back to form values for no gain —
       * the server echoed exactly what it was given.
       */
      reset(getValues());

      toast.add({
        type: "success",
        title: "Settings saved",
        description: "Reminders and defaults updated.",
      });

      // The topbar's badge and the sidebar's applications link are both
      // server-rendered from these columns, so the shell has to be refetched.
      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit(save)} className="flex flex-col gap-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Reminders</CardTitle>
          <CardDescription>
            Everything you tick appears in the notification inbox. There is no email — switching one
            off means it is never generated at all, rather than generated and hidden.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {PREFERENCE_KEYS.map((key) => (
              <Controller
                key={key}
                name={key}
                control={control}
                render={({ field }) => (
                  /*
                   * The choice-card composition the onboarding wizard's work-mode
                   * group established: a `FieldLabel` wrapping a horizontal
                   * `Field` picks up the border, shadow and accent tint on
                   * `data-checked` for free, so a ticked reminder is legible
                   * across the group at a glance rather than by reading four
                   * small boxes.
                   */
                  <FieldLabel className="font-normal">
                    <Field orientation="horizontal">
                      <Checkbox
                        name={field.name}
                        checked={field.value}
                        onCheckedChange={(next) => field.onChange(next === true)}
                        onBlur={field.onBlur}
                      />

                      <FieldContent>
                        <FieldTitle>{NOTIFICATION_PREFERENCE_COPY[key].label}</FieldTitle>
                        <FieldDescription>
                          {NOTIFICATION_PREFERENCE_COPY[key].description}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                )}
              />
            ))}

            <Field>
              <FieldLabel htmlFor="reminderHours">How far ahead</FieldLabel>

              <Controller
                name="reminderHours"
                control={control}
                render={({ field }) => (
                  <EnumSelect
                    id="reminderHours"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    options={REMINDER_OPTIONS}
                    invalid={Boolean(errors.reminderHours)}
                    describedBy="reminderHours-description"
                  />
                )}
              />

              <FieldDescription id="reminderHours-description">
                Interviews are measured to the hour. Deadlines are whole days, so a day before means
                “due today or tomorrow”.
              </FieldDescription>

              <FieldError errors={errors.reminderHours ? [errors.reminderHours] : undefined} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Account</CardTitle>
          <CardDescription>
            How the app opens, and the clock every interview time is shown in.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="defaultView">Applications open as</FieldLabel>

              <Controller
                name="defaultView"
                control={control}
                render={({ field }) => (
                  <EnumSelect
                    id="defaultView"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    options={VIEW_OPTIONS}
                    invalid={Boolean(errors.defaultView)}
                  />
                )}
              />

              <FieldError errors={errors.defaultView ? [errors.defaultView] : undefined} />
            </Field>

            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>

              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    id="timezone"
                    options={TIMEZONES}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Search for a city or region"
                    // Strict: an unknown zone would silently shift every
                    // interview time in the product, so a typo must not be
                    // accepted the way a hand-typed university is.
                    allowCustomValue={false}
                    invalid={Boolean(errors.timezone)}
                    describedBy="timezone-description"
                  />
                )}
              />

              <FieldDescription id="timezone-description">
                Interview times are stored as exact moments and shown in this zone, so changing it
                re-labels them rather than moving them. Deadlines are calendar days and do not
                shift.
              </FieldDescription>

              <FieldError errors={errors.timezone ? [errors.timezone] : undefined} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>

        {isDirty ? (
          <p className="text-muted-foreground text-xs">You have unsaved changes.</p>
        ) : null}
      </div>
    </form>
  );
}
