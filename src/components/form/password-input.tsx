"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "cn";

import { Input } from "@/components/ui/input";

/**
 * A password field with a reveal toggle.
 *
 * A typo in a masked field is invisible, and on a sign-in form the only
 * feedback is a failed attempt that cannot say *why* it failed (see
 * `LoginForm`'s SIGN_IN_FAILED — the message is deliberately identical for a
 * wrong password and a missing account). Letting the user look at what they
 * typed is the cheapest way to keep that ambiguity from being the user's
 * problem.
 *
 * `type` is omitted from the props on purpose: it is this component's to own,
 * and a caller passing `type="text"` would silently unmask the field.
 *
 * The button is `type="button"`, which matters more than it looks — it sits
 * inside the auth forms, and a default-type button inside a form is a submit
 * button. Toggling visibility must never post the form.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        // Room for the button, so a long password never runs underneath it.
        className={cn("pr-10", className)}
        {...props}
      />

      <button
        type="button"
        // Inset by 1px rather than pinned to the edge: the focus ring is drawn
        // outside the button, and against the field border it would otherwise
        // read as a rendering artefact.
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 absolute inset-y-px right-px flex w-9 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none"
        onClick={() => setVisible((current) => !current)}
        disabled={props.disabled}
        // The accessible name carries the state, so there is no aria-pressed as
        // well — a screen reader announcing "hide password, pressed" says the
        // same thing twice.
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={props.id}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
