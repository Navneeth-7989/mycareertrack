/**
 * The visual beside the sign-in form: a trend line over a small stage funnel.
 *
 * Shape only — no axis labels, no figures, nothing that could be mistaken for a
 * reading of anyone's data. It says "this product measures your pipeline over
 * time" without inventing what the measurements were, which is the same rule
 * the landing page illustration follows.
 *
 * `currentColor` throughout rather than CSS variables in SVG attributes: the
 * gradient stops inherit from a single `text-primary` on the root, which is both
 * reliable across browsers and theme-aware for free.
 */
const FUNNEL = [
  { stage: "Applied", width: "w-[86%]", tone: "bg-primary/55" },
  { stage: "Interview", width: "w-[52%]", tone: "bg-primary/80" },
  { stage: "Offer", width: "w-[24%]", tone: "bg-success" },
] as const;

export function InsightVisual() {
  return (
    <div
      aria-hidden="true"
      className="bg-card border-border flex flex-col gap-6 rounded-2xl border p-5 shadow-lg"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] font-medium">Your pipeline over time</span>
        <span className="bg-accent text-primary rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
          Trending up
        </span>
      </div>

      <svg
        viewBox="0 0 320 124"
        className="text-primary h-24 w-full"
        preserveAspectRatio="none"
        role="presentation"
      >
        <defs>
          <linearGradient id="insight-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[28, 62, 96].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="320"
            y2={y}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="4 5"
          />
        ))}

        <polygon
          points="0,104 53,92 107,96 160,72 213,60 267,40 320,24 320,124 0,124"
          fill="url(#insight-area)"
        />

        <polyline
          points="0,104 53,92 107,96 160,72 213,60 267,40 320,24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {[
          [107, 96],
          [213, 60],
          [320, 24],
        ].map(([x, y]) => (
          <circle
            key={x}
            cx={x}
            cy={y}
            r="3.5"
            fill="currentColor"
            className="stroke-card"
            strokeWidth="2"
          />
        ))}
      </svg>

      <ul className="flex flex-col gap-3">
        {FUNNEL.map(({ stage, width, tone }) => (
          <li key={stage} className="flex items-center gap-3">
            <span className="text-muted-foreground w-16 shrink-0 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
              {stage}
            </span>
            <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <span className={`block h-full rounded-full ${tone} ${width}`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
