"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * A free-text list input: type, press Enter, get a chip.
 *
 * Used for target roles, skills and preferred locations, which are Postgres
 * arrays of free text (DESIGN.md §3) rather than a fixed vocabulary — so a
 * dropdown would be wrong, and a comma-separated text field would make the
 * user responsible for the data format.
 *
 * Deduplication happens here as well as in the Zod schema. The schema is the
 * guarantee; this is so the user never sees the same chip twice and wonders
 * which one to remove.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  "aria-describedby": describedBy,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  "aria-describedby"?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    // Splitting on commas means a pasted "React, TypeScript, Node" becomes
    // three chips instead of one very long one.
    const additions = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (additions.length === 0) {
      setDraft("");
      return;
    }

    const seen = new Set(value.map((item) => item.toLowerCase()));
    const next = [...value];

    for (const addition of additions) {
      const key = addition.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        next.push(addition);
      }
    }

    onChange(next);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Without this the keypress submits the form, and the half-typed skill
      // is lost along with the page.
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.target.value;

          if (next.includes(",")) {
            commit(next);
          } else {
            setDraft(next);
          }
        }}
        onKeyDown={handleKeyDown}
        // Committing on blur is what saves the entry of someone who types a
        // skill and then clicks Next without pressing Enter.
        onBlur={() => commit(draft)}
      />

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag.toLowerCase()}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((item) => item !== tag))}
                  aria-label={`Remove ${tag}`}
                  className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring/40 rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2"
                >
                  {/* Sized here, not by the badge: the badge's `[&>svg]` rule
                      only reaches direct children, and this one is nested in a
                      button — so without this it renders at lucide's 24px. */}
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
