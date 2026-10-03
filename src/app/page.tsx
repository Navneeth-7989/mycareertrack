import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  CircleCheck,
  FileText,
  LayoutGrid,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { UserMenu } from "@/components/account/user-menu";
import { Logo } from "@/components/brand/logo";
import { AppPreview } from "@/components/marketing/app-preview";
import { getCurrentUser } from "@/server/require-user";

/**
 * The landing page.
 *
 * It reads the session, which means it renders per request rather than being
 * prerendered — a deliberate trade. The alternative was showing "Sign in" and
 * "Get started" to someone who is already signed in, which is the kind of
 * detail that makes a product feel like a demo.
 *
 * Every control here is an anchor, not a `Button` — they are navigations, and
 * the element has to be the real thing for middle-click, "open in new tab" and
 * the status bar to work. The classes come from the dark-surface constants
 * below rather than from `buttonVariants`; see the note on those.
 */
const FEATURES = [
  {
    icon: LayoutGrid,
    title: "One pipeline, not five tabs",
    description:
      "Every role you have saved, applied to or interviewed for — with its company, deadline and current stage — in a single view.",
  },
  {
    icon: BellRing,
    title: "Nothing quietly missed",
    description:
      "A reminder in your inbox 24 hours before each interview, assessment and deadline, so a date never passes while you are heads-down.",
  },
  {
    icon: TrendingUp,
    title: "Rates that tell the truth",
    description:
      "Response, interview and offer rates measured against the applications you actually submitted — not the ones you saved and forgot.",
  },
  {
    icon: FileText,
    title: "Resumes and contacts, attached",
    description:
      "The resume version you sent stays with the application it belongs to, next to the recruiter who replied.",
  },
] as const;

const TRACKED = [
  { icon: Briefcase, label: "Applications" },
  { icon: CalendarClock, label: "Interviews" },
  { icon: Target, label: "Assessments" },
  { icon: CircleCheck, label: "Tasks" },
  { icon: Users, label: "Contacts" },
  { icon: Building2, label: "Companies" },
  { icon: FileText, label: "Resumes" },
  { icon: BellRing, label: "Reminders" },
] as const;

const STEPS = [
  {
    step: "01",
    title: "Save the role",
    body: "Company, title, link, deadline. Companies autocomplete from a seeded list, so one employer never splits into three spellings.",
  },
  {
    step: "02",
    title: "Move it along",
    body: "Applied, assessment, interview, offer. Every change writes itself to that application's timeline as you go.",
  },
  {
    step: "03",
    title: "Read the numbers",
    body: "Which companies replied, how long they took, and the stage where your pipeline keeps stalling.",
  },
] as const;

const SPREADSHEET_PAINS = [
  "A deadline passes because nothing reminded you",
  "Three rows for the same company, spelled three ways",
  "No idea which resume version you actually sent",
  "Counting interviews by hand to see if it is working",
] as const;

/*
 * The header and the hero share one dark surface, so their controls cannot come
 * from the light-surface button variants — `bg-primary` is tuned for white
 * cards and the ring offset would draw a pale halo on slate. These four strings
 * are the dark-surface equivalents, written out rather than layered over
 * `buttonVariants` so there is no pair of background utilities left to fight
 * over source order.
 */
const DARK_FOCUS =
  "outline-none focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

const NAV_GHOST = `inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-[0.8125rem] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${DARK_FOCUS}`;

/*
 * White on the dark surfaces, not blue. A blue button sits inside the hero's
 * own blue bloom and half disappears into it; white is the one value that
 * cannot. The blue stays where it reads as blue — the buttons on the white
 * sections below, which keep `--primary`.
 *
 * The rule the page follows: blue is identity (the mark, the avatar, links,
 * focus rings), white is the action on dark.
 */
const NAV_CTA = `inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-[0.8125rem] font-medium text-slate-950 transition-colors hover:bg-slate-200 ${DARK_FOCUS}`;

const HERO_CTA = `inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[0.9375rem] font-medium text-slate-950 shadow-lg transition-colors hover:bg-slate-200 [&_svg]:size-4 [&_svg]:shrink-0 ${DARK_FOCUS}`;

const HERO_GHOST = `inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 text-[0.9375rem] font-medium text-white transition-colors hover:border-white/30 hover:bg-white/10 ${DARK_FOCUS}`;

const CAREERTRACK_ANSWERS = [
  "Reminders 24 hours before anything is due",
  "Companies matched on a normalised name, so duplicates cannot form",
  "The resume version stays attached to the application",
  "Response, interview and offer rates kept current for you",
] as const;

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      {/*
       * Solid slate-950 with no bottom border — the exact surface the hero
       * uses, so the two meet with nothing visible between them.
       *
       * It was `bg-slate-950/80` with a blur and a white hairline, and both
       * were the problem: at 80% the hero's blue bloom showed through the bar
       * at a different strength than the hero itself, and the hairline drew a
       * line across a join that is supposed to be invisible. Translucency also
       * meant the bar picked up whatever light section was passing underneath
       * on scroll.
       *
       * The hero's glow is centred below this bar (see the gradient there) so
       * the join lands on flat slate rather than halfway up a bloom.
       */}
      <header className="sticky top-0 z-50 bg-slate-950">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link
            href="/"
            aria-label="CareerTrack home"
            className={`rounded-lg text-white ${DARK_FOCUS}`}
          >
            <Logo size="sm" />
          </Link>

          {user ? (
            <nav className="flex items-center gap-3">
              <Link href="/dashboard" className={NAV_CTA}>
                Dashboard
              </Link>
              <UserMenu
                name={user.name}
                email={user.email}
                className="focus-visible:ring-white/40 focus-visible:ring-offset-slate-950"
              />
            </nav>
          ) : (
            <nav className="flex items-center gap-1.5">
              <Link href="/login" className={NAV_GHOST}>
                Sign in
              </Link>
              <Link href="/register" className={NAV_CTA}>
                Get started
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/*
         * A dark hero, with the illustration below straddling the boundary into
         * the light page. The contrast is the point: a slate-on-white page top
         * to bottom reads washed out no matter how good the type is.
         */}
        <section className="relative isolate overflow-hidden bg-slate-950 px-6 pt-20 pb-44 text-white sm:pt-28">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(75%_65%_at_50%_30%,rgb(10_102_194_/_0.42),transparent_72%)]" />
          <div className="surface-grid-dark absolute inset-0 -z-10 [mask-image:radial-gradient(70%_60%_at_50%_25%,black,transparent)]" />

          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-blue-200 uppercase">
              Job application tracker
            </p>

            <h1 className="font-heading mt-6 text-4xl leading-[1.05] font-semibold text-balance text-white sm:text-5xl lg:text-6xl">
              Every application, interview and offer in one place.
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty text-slate-300 sm:text-lg">
              Built for students and new grads running a job hunt across dozens of companies, a
              dozen deadlines and a spreadsheet that stopped being useful weeks ago.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {user ? (
                <Link href="/dashboard" className={HERO_CTA}>
                  Go to your dashboard
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link href="/register" className={HERO_CTA}>
                    Create your account
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link href="/login" className={HERO_GHOST}>
                    Sign in
                  </Link>
                </>
              )}
            </div>

            <p className="mt-5 text-[0.8125rem] text-slate-400">
              {user
                ? "You are signed in — pick up where you left off."
                : "Google, GitHub, or an email and password."}
            </p>
          </div>
        </section>

        {/*
         * `relative z-10` is what keeps the illustration in front of the hero.
         * Without it this section is statically positioned while the hero above
         * is `relative`, and a positioned element always paints over a static
         * sibling regardless of document order — so the card slid in behind the
         * dark panel it is meant to overlap.
         */}
        <section className="relative z-10 px-6">
          <div className="mx-auto -mt-32 max-w-5xl">
            <AppPreview />
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="eyebrow">What it does</p>
              <h2 className="font-heading mt-3 text-2xl font-semibold text-balance sm:text-3xl">
                A tracker that keeps up with an actual job hunt.
              </h2>
            </div>

            <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title}>
                  <span className="bg-accent text-primary flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>

                  <h3 className="mt-5 text-[0.9375rem] font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-card border-border border-y px-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <div>
              <p className="eyebrow">Everything in one record</p>
              <h2 className="font-heading mt-3 text-2xl font-semibold text-balance sm:text-3xl">
                One application holds everything attached to it.
              </h2>
              <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                Not eight disconnected lists. Open a role and the interviews, assessments, tasks,
                contacts, resume version and notes are already there, with a timeline of everything
                that has happened so far.
              </p>
            </div>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {TRACKED.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="border-border bg-background flex flex-col items-center gap-2.5 rounded-xl border px-3 py-5 text-center"
                >
                  <Icon className="text-primary size-5" aria-hidden="true" />
                  <span className="text-[0.8125rem] font-medium">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="font-heading mt-3 text-2xl font-semibold text-balance sm:text-3xl">
                Three habits, and the rest is bookkeeping you no longer do.
              </h2>
            </div>

            <ol className="divide-border mt-12 grid divide-y overflow-hidden rounded-2xl border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {STEPS.map(({ step, title, body }) => (
                <li key={step} className="bg-card p-7 sm:p-8">
                  <span className="font-heading text-primary text-sm font-semibold tabular-nums">
                    {step}
                  </span>
                  <h3 className="font-heading mt-4 text-lg font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-card border-border border-y px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Why not a spreadsheet</p>
              <h2 className="font-heading mt-3 text-2xl font-semibold text-balance sm:text-3xl">
                A spreadsheet holds the data. It just never tells you anything.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <div className="border-border bg-background rounded-2xl border p-7">
                <h3 className="text-muted-foreground text-[0.8125rem] font-semibold tracking-[0.08em] uppercase">
                  The spreadsheet
                </h3>
                <ul className="mt-5 flex flex-col gap-4">
                  {SPREADSHEET_PAINS.map((pain) => (
                    <li key={pain} className="flex gap-3">
                      <X
                        className="text-muted-foreground mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground text-sm leading-relaxed">{pain}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-primary/25 bg-accent/60 rounded-2xl border p-7">
                <h3 className="text-primary text-[0.8125rem] font-semibold tracking-[0.08em] uppercase">
                  CareerTrack
                </h3>
                <ul className="mt-5 flex flex-col gap-4">
                  {CAREERTRACK_ANSWERS.map((answer) => (
                    <li key={answer} className="flex gap-3">
                      <CircleCheck
                        className="text-primary mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed">{answer}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="relative isolate mx-auto max-w-4xl overflow-hidden rounded-3xl bg-slate-950 px-8 py-16 text-center text-white shadow-xl sm:px-12">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_50%_0%,rgb(10_102_194_/_0.5),transparent_70%)]" />

            <h2 className="font-heading text-2xl font-semibold text-balance text-white sm:text-3xl">
              {user
                ? "Your pipeline is waiting."
                : "Start with the application you are about to forget."}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-300">
              {user
                ? "Open the dashboard and add the next role you are applying for."
                : "Create an account, finish a short setup, and add your first role in under a minute."}
            </p>

            <Link href={user ? "/dashboard" : "/register"} className={`mt-8 ${HERO_CTA}`}>
              {user ? "Go to your dashboard" : "Create your account"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-card border-border border-t px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
          <Logo size="sm" />

          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} CareerTrack. Track every application, interview and offer.
          </p>

          <Link
            href={user ? "/dashboard" : "/login"}
            className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
          >
            {user ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
