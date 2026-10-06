"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * A dropdown over one of the application enums, wired for React Hook Form.
 *
 * Shared rather than written per field because the form has five of these and
 * the filter bar and edit form will have the same five again. Two details it
 * centralises:
 *
 * 1. **An optional enum gets an explicit "not specified" row** whose value is
 *    the empty string, instead of a placeholder the user cannot get back to.
 *    Once someone has picked "Hybrid" by mistake, a placeholder is unreachable
 *    — the only way back to "no answer" is a row they can choose. The schema
 *    turns "" into null (see `optionalEnum` in `validations/application`).
 * 2. **The trigger renders the label, not the stored value.** `SelectValue`
 *    takes a function so "FULL_TIME" is never what the user sees, including in
 *    the moment before the popup has ever opened.
 */

export type EnumOption = {
  value: string;
  label: string;
  /** Second line in the popup. Used where the label alone is ambiguous. */
  hint?: string;
};

/** Builds the options for a required enum from its values and label map. */
export function enumOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
  hints?: Record<T, string>,
): EnumOption[] {
  return values.map((value) => ({
    value,
    label: labels[value],
    ...(hints ? { hint: hints[value] } : {}),
  }));
}

export function EnumSelect({
  id,
  value,
  onValueChange,
  onBlur,
  options,
  emptyLabel,
  invalid = false,
  describedBy,
  disabled = false,
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  onBlur?: () => void;
  options: readonly EnumOption[];
  /**
   * Present for an optional field, absent for a required one — which is also
   * what decides whether the "no answer" row is rendered at all.
   */
  emptyLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const all: EnumOption[] = emptyLabel
    ? [{ value: "", label: emptyLabel }, ...options]
    : [...options];

  const labels = new Map(all.map((option) => [option.value, option.label]));

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(typeof next === "string" ? next : "")}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue>
          {(current: unknown) => {
            // `null` is what Base UI reports before anything is chosen, and
            // String(null) is the string "null" — which would miss the lookup
            // and render the word.
            const key = current == null ? "" : String(current);

            return (
              <span className={key === "" ? "text-muted-foreground" : undefined}>
                {labels.get(key) ?? emptyLabel ?? ""}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {all.map((option) => (
          <SelectItem key={option.value || "__empty"} value={option.value}>
            {option.hint ? (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <SelectItemText>{option.label}</SelectItemText>
                <span className="text-muted-foreground text-xs">{option.hint}</span>
              </span>
            ) : (
              <SelectItemText>{option.label}</SelectItemText>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
