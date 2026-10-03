"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";

/**
 * A single-select combobox over a curated list that still accepts anything the
 * user types.
 *
 * The lists behind it (universities, degrees, fields of study) can never be
 * complete, so "not in the list" must not mean "cannot sign up". Two things
 * make that true:
 *
 * 1. A "Use «what you typed»" row appears at the bottom of the results
 *    whenever the text matches no entry exactly. It sits *after* the matches,
 *    not before, so a user typing "IIT B" is offered the real institutions
 *    first and the raw text last.
 * 2. Leaving the field commits the typed text anyway (`commitTypedText`), for
 *    the user who types their college and tabs straight on without noticing the
 *    row. Without it, Base UI would quietly restore the previous value and the
 *    answer would be gone.
 *
 * Filtering is done here rather than by Base UI (`filter={null}`) for two
 * reasons: exact-prefix matches are ranked above mid-string ones, which matters
 * a lot on a 400-entry list where the acronym also appears in brackets; and
 * knowing the match count is what decides whether the separator and the empty
 * message are drawn at all.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  allowCustomValue = true,
  invalid = false,
  autoFocus = false,
  describedBy,
  emptyMessage = "No matches.",
  limit = 50,
}: {
  id: string;
  options: readonly string[];
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  /** When false the field is a strict pick-from-list. */
  allowCustomValue?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  emptyMessage?: string;
  /**
   * Rendering all 400-odd institutions on an empty query costs a long popup
   * and a lot of DOM for no benefit — nobody scrolls that far. Typing narrows
   * it long before the cap matters.
   */
  limit?: number;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const matches = useMemo(() => {
    if (!trimmed) {
      return options.slice(0, limit);
    }

    const needle = trimmed.toLowerCase();
    const prefixed: string[] = [];
    const contained: string[] = [];

    for (const option of options) {
      const haystack = option.toLowerCase();

      if (haystack.startsWith(needle)) {
        prefixed.push(option);
      } else if (haystack.includes(needle)) {
        contained.push(option);
      }
    }

    return [...prefixed, ...contained].slice(0, limit);
  }, [options, trimmed, limit]);

  const matchesExistingOption = useMemo(
    () => options.some((option) => option.toLowerCase() === trimmed.toLowerCase()),
    [options, trimmed],
  );

  // Hidden when the text already *is* the selection: re-opening the popup
  // refills the input with the current value, and offering to "use" a value
  // that is already chosen reads like the field failed to save it.
  const showCustomOption =
    allowCustomValue &&
    trimmed.length > 0 &&
    !matchesExistingOption &&
    trimmed.toLowerCase() !== value.trim().toLowerCase();

  /**
   * Called on blur. By then an item click has already updated both the value
   * and the input text, so the equality check below is what stops this from
   * overwriting a fresh selection with the half-typed query that preceded it.
   */
  function commitTypedText() {
    if (!allowCustomValue) {
      return;
    }

    const text = query.trim();

    if (!text || text.toLowerCase() === value.trim().toLowerCase()) {
      return;
    }

    // Prefer the list's own spelling when the text matches an entry — this is
    // what stops "iit bombay" being stored next to "IIT Bombay".
    const existing = options.find((option) => option.toLowerCase() === text.toLowerCase());

    onValueChange(existing ?? text);
  }

  return (
    <Combobox
      items={matches}
      filter={null}
      value={value === "" ? null : value}
      onValueChange={(next) => onValueChange(typeof next === "string" ? next : "")}
      onInputValueChange={setQuery}
      autoHighlight
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        showClear={value !== ""}
        onBlur={commitTypedText}
      />

      <ComboboxContent>
        <ComboboxList>
          <ComboboxCollection>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxCollection>

          {showCustomOption && (
            <>
              {matches.length > 0 && <ComboboxSeparator />}

              <ComboboxItem value={trimmed}>
                <Plus aria-hidden="true" />
                <span className="truncate">Use “{trimmed}”</span>
              </ComboboxItem>
            </>
          )}
        </ComboboxList>

        {/* Only reachable when custom values are off; otherwise the row above is
            always the answer to "nothing matched". */}
        {!allowCustomValue && <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>}
      </ComboboxContent>
    </Combobox>
  );
}
