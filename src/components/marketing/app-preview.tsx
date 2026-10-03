import { Search } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";

/**
 * A structural illustration of the pipeline, for the landing page.
 *
 * It shows the *shape* of the product — the stages an application moves
 * through, and that each stage holds cards — and nothing else. There are no
 * invented companies, no invented roles and deliberately no figures of any
 * kind: a landing page that advertises "24 applications, 38% response rate"
 * is quoting numbers that belong to nobody, and a visitor who reads them as a
 * sample of their own data has been misled by the first thing they saw.
 *
 * The stage names are the only words in here, and they are real product
 * vocabulary rather than data.
 *
 * Hand-built from the same tokens as the real UI: it cannot go stale against a
 * redesign, costs no image bytes, and stays sharp at every density. Hidden from
 * assistive technology, since the surrounding copy carries the meaning.
 */
const STAGES = [
  { name: "Saved", tone: "bg-muted-foreground/40", cards: 2, visibility: "" },
  { name: "Applied", tone: "bg-primary/60", cards: 3, visibility: "" },
  { name: "Assessment", tone: "bg-warning", cards: 1, visibility: "hidden sm:flex" },
  { name: "Interview", tone: "bg-primary", cards: 2, visibility: "hidden lg:flex" },
  { name: "Offer", tone: "bg-success", cards: 1, visibility: "hidden lg:flex" },
] as const;

/** Varied widths so the cards read as content, not as a loading skeleton. */
const CARD_WIDTHS = [
  ["w-full", "w-2/3"],
  ["w-5/6", "w-1/2"],
  ["w-11/12", "w-3/5"],
] as const;

function PlaceholderCard({ index }: { index: number }) {
  const [title, subtitle] = CARD_WIDTHS[index % CARD_WIDTHS.length] ?? CARD_WIDTHS[0];

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-2.5 shadow-xs">
      <span className={`bg-muted-foreground/25 h-2 rounded-full ${title}`} />
      <span className={`bg-muted h-1.5 rounded-full ${subtitle}`} />
      <span className="bg-accent mt-0.5 h-3 w-10 rounded-full" />
    </div>
  );
}

export function AppPreview() {
  return (
    <div
      aria-hidden="true"
      className="bg-card border-border overflow-hidden rounded-2xl border shadow-xl"
    >
      <div className="border-border flex items-center gap-4 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <LogoMark size="sm" />
          <span className="hidden text-[0.8125rem] font-medium sm:inline">Pipeline</span>
        </div>

        <div className="border-border bg-muted/50 text-muted-foreground mx-auto flex h-7 w-full max-w-xs items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" />
          <span className="bg-muted-foreground/20 h-1.5 w-20 rounded-full" />
        </div>

        <div className="bg-primary/15 size-7 shrink-0 rounded-full" />
      </div>

      <div className="bg-muted/30 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
        {STAGES.map((stage) => (
          <div key={stage.name} className={`flex flex-col gap-2.5 ${stage.visibility}`}>
            <div className="flex items-center gap-2 px-0.5">
              <span className={`size-1.5 shrink-0 rounded-full ${stage.tone}`} />
              <span className="text-muted-foreground truncate text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
                {stage.name}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {Array.from({ length: stage.cards }, (_, index) => (
                <PlaceholderCard key={index} index={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
