"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus } from "lucide-react";

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxStatus,
} from "@/components/ui/combobox";
import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";
import { companySearchResponseSchema, type CompanyOption } from "@/lib/validations/company";

/**
 * Company autocomplete over the seeded list plus the companies this user has
 * added (DESIGN.md §6).
 *
 * The value is the company **name**, not an id. The server resolves a name to a
 * row through `company-resolver.ts`, which means the form has nothing to
 * reconcile: a name typed from scratch, a name picked from the list, and a name
 * whose casing differs from the stored row all submit identically and all land
 * on the same `Company`. Threading an id through the form would add a second
 * source of truth that could disagree with the text in the input.
 *
 * Three behaviours this has to get right, all of them learned from the
 * curated-list fields in the onboarding wizard:
 *
 * 1. **An unlisted company must still be usable.** "Add «what you typed»" sits
 *    *after* the matches, so someone typing "Zer" is offered Zerodha first.
 * 2. **Leaving the field commits the typed text.** Users type a company and tab
 *    straight to the job title; without this, Base UI restores the previous
 *    value and the answer is silently gone.
 * 3. **Nothing is created while typing.** The row only appears in the database
 *    when the application is submitted — otherwise an abandoned form would
 *    leave litter in everyone's autocomplete.
 */

/** Long enough to not fire per keystroke, short enough to feel immediate. */
const DEBOUNCE_MS = 200;

type LoadState = "idle" | "loading" | "error";

export function CompanyCombobox({
  id,
  value,
  onValueChange,
  placeholder = "Search or type a company",
  invalid = false,
  describedBy,
  autoFocus = false,
  disabled = false,
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [state, setState] = useState<LoadState>("idle");

  const trimmed = query.trim();

  // The query the options on screen actually answer. Comparing it to `trimmed`
  // is how the popup knows it is showing stale results, which is what stops
  // "Add «Googl»" flashing up for a fraction of a second while the request for
  // "Googl" is still in flight.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Not state: changing it must not re-render, and the effect below needs the
  // previous request's controller rather than the one from its own closure.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    // Debounce and abort together. Without the abort, two searches can resolve
    // out of order and leave the list answering an older query than the input.
    const timer = setTimeout(() => {
      inFlight.current?.abort();

      const controller = new AbortController();
      inFlight.current = controller;

      setState("loading");

      void (async () => {
        try {
          const response = await fetch(
            `/api/companies/search?q=${encodeURIComponent(trimmed)}`,
            // Reads are the one thing worth retrying, but a stale suggestion
            // list is cheap to miss — so this just reports and lets the next
            // keystroke try again.
            { signal: controller.signal, headers: { Accept: "application/json" } },
          );

          const parsed = companySearchResponseSchema.safeParse(
            await response.json().catch(() => null),
          );

          if (!response.ok || !parsed.success) {
            setOptions([]);
            setState("error");
            return;
          }

          setOptions(parsed.data.data);
          setLoadedFor(trimmed);
          setState("idle");
        } catch (error) {
          // An abort is this component replacing its own request, not a failure.
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setOptions([]);
          setState("error");
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed]);

  // Abort whatever is open when the form unmounts, so a resolved request cannot
  // set state on a component that is gone.
  useEffect(() => () => inFlight.current?.abort(), []);

  const names = useMemo(() => options.map((option) => option.name), [options]);

  const byName = useMemo(() => new Map(options.map((option) => [option.name, option])), [options]);

  const showing = loadedFor === trimmed;

  /**
   * Whether to offer the typed text as a new company.
   *
   * The comparison is on the normalized key, not the raw text: typing
   * "google llc" when Google is already in the list must not offer to add a
   * second Google, because the resolver would hand back the same row anyway and
   * the option would be a lie.
   */
  const typedKey = normalizeCompanyName(trimmed);

  const showAddOption =
    showing &&
    typedKey.length > 0 &&
    !options.some((option) => option.nameNormalized === typedKey) &&
    typedKey !== normalizeCompanyName(value);

  /**
   * Called on blur. An item click has already updated both the value and the
   * input text by then, so the equality check is what stops this overwriting a
   * fresh selection with the half-typed query that preceded it.
   */
  function commitTypedText() {
    const text = query.trim();

    if (!text || text === value.trim()) {
      return;
    }

    // Prefer the stored spelling when the text resolves to a company already on
    // screen — "Tata Consultancy Services" rather than "tata consultancy
    // services", even though both would resolve to the same row.
    const key = normalizeCompanyName(text);
    const match = options.find((option) => option.nameNormalized === key);

    onValueChange(match?.name ?? text);
  }

  return (
    <Combobox
      items={names}
      // Filtering already happened in Postgres, against the normalized match
      // key. Letting Base UI filter again would hide "Google" from someone who
      // typed "Google LLC", because that is not a substring of the name.
      filter={null}
      value={value === "" ? null : value}
      onValueChange={(next) => onValueChange(typeof next === "string" ? next : "")}
      onInputValueChange={setQuery}
      disabled={disabled}
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
            {(name: string) => {
              const option = byName.get(name);

              return (
                <ComboboxItem key={name} value={name}>
                  <Building2 aria-hidden="true" className="text-muted-foreground" />

                  <span className="min-w-0 flex-1 truncate">{name}</span>

                  {option?.website && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {displayHost(option.website)}
                    </span>
                  )}
                </ComboboxItem>
              );
            }}
          </ComboboxCollection>

          {showAddOption && (
            <>
              {names.length > 0 && <ComboboxSeparator />}

              <ComboboxItem value={trimmed}>
                <Plus aria-hidden="true" className="text-primary" />

                <span className="min-w-0 flex-1 truncate">
                  Add “<span className="font-medium">{trimmed}</span>”
                </span>

                <span className="text-muted-foreground shrink-0 text-xs">New company</span>
              </ComboboxItem>
            </>
          )}
        </ComboboxList>

        {/* Must stay mounted for screen readers to announce it, so the message
            is what changes — never the element. */}
        <ComboboxStatus>
          {statusMessage(state, trimmed, names.length, showAddOption)}
        </ComboboxStatus>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The popup is never empty-looking without saying why. The one case that needs
 * no message is the useful one: matches on screen, or an "Add" row the user can
 * act on.
 */
function statusMessage(
  state: LoadState,
  trimmed: string,
  matchCount: number,
  showAddOption: boolean,
): string {
  if (state === "error") {
    return "Could not load companies. Type the name and keep going.";
  }

  if (matchCount > 0 || showAddOption) {
    return "";
  }

  if (state === "loading") {
    return "Searching…";
  }

  // An empty query with no recents: a new account, before any application
  // exists. "No matches" would be wrong — nothing was searched for.
  return trimmed ? "No matches." : "Start typing to find a company.";
}

/** "https://www.google.com/careers" → "google.com". */
function displayHost(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
