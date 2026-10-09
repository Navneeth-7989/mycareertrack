# CareerTrack

A job and internship application tracker that answers the question a spreadsheet cannot: **which of
the things you are doing is actually working.**

Built with Next.js 16, TypeScript, Prisma 7 and Postgres. 55 routes, 17 models, 768 tests.

---

## The problem

Anyone running a serious job search is tracking it somewhere — a spreadsheet, a notes app, their
inbox. Those work for _remembering_ and fail at _learning_. By application forty you have lost track
of which companies replied, which resume version you sent to whom, whether the referral you chased
actually converted better than the portal applications, and what you were supposed to follow up on
this week.

The information to answer all of that is already in the tracker. What is missing is anything that
computes with it.

CareerTrack is a tracker whose point is the arithmetic:

- **Response rate, interview rate and offer rate**, over submitted applications — not over saved
  ones, which would flatter every number.
- **Which source converts.** Referral, LinkedIn, company site, campus, Indeed. The headline claim
  the product exists to make is "referrals convert 4× better than job boards for you", and it is
  computed from interview rate rather than response rate, because an automated rejection is a
  response and a channel that reliably replies "no" is not worth more of your time.
- **How long companies actually take to reply**, median first and mean second — the gap between the
  two is the finding, because one company sitting on an application for three months drags the mean.
- **What is due.** Interviews in the next 24 hours, assessment deadlines, task due dates, surfaced
  in an inbox and on a bell badge that clears itself.

---

## Features

**Applications**

- Create, edit and delete with a company resolver that normalises names, so "Google", "google" and
  "Google LLC" cannot become three companies.
- Autocomplete over 484 seeded companies (India-weighted: global tech, Indian IT services, product
  companies and startups, finance, consulting, core engineering) plus any you add yourself. Your own
  companies are private — they never surface in another account's suggestions.
- A **Kanban board** with drag-and-drop across nine pipeline statuses, and a **table view** with
  server-side search, filters, sort and pagination. The status dropdown is the primary control in
  both views, and it is the accessible path rather than a fallback.
- Duplicate detection with two different answers: another role at the same company is an advisory,
  a near-identical role asks for confirmation before saving anything.
- Delete is real, and **undo restores from a snapshot** with ids preserved — a restored application
  is the same application, so the old link still resolves and its timeline keeps its original dates.

**Depth, per application**

- A **timeline** mixing automatic entries (saved, applied, status changes) with ones you write
  yourself. An "email received" entry is what stamps the first response, which is one half of every
  response-rate figure in the product.
- **Interviews** with proper timezone handling — stored as instants, displayed in your zone.
- **Assessments** with deadlines, **notes**, **tasks** (overdue / today / upcoming / completed, and
  tasks can stand alone with no application), and **contacts** linked many-to-many, auto-created
  from the recruiter fields on the application form.

**Resumes**

- Upload to a private bucket, validated on MIME type **and magic bytes** — a `.exe` renamed to
  `.pdf` is refused on its contents, not its name.
- Preview a PDF in-app without downloading it, download via short-lived signed URLs after an
  ownership check.
- **Soft delete**: the file is really removed, the record survives, so a past application can still
  tell you which version got the interview — marked "(deleted)".

**Analytics** — every metric above, with empty states for thin data and rates hidden below a minimum
sample size. Below the threshold the bars come off too, because a bar at two-thirds of its track is
a 67% claim whether or not the number is printed.

**Notifications** — an in-app inbox generated on read, a two-tier bell badge, and preference
toggles. No email: see [Future work](#future-work).

---

## Stack

| Layer       | Choice                                                     | Why                                                                                                       |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Framework   | **Next.js 16.3.7** (App Router, Turbopack, React Compiler) | Server Components mean most pages query the database directly with no API round trip                      |
| Language    | **TypeScript** (strict)                                    | —                                                                                                         |
| Database    | **Postgres** on [Neon](https://neon.tech)                  | Serverless, branchable, generous free tier                                                                |
| ORM         | **Prisma 7** with the `@prisma/adapter-pg` driver adapter  | Prisma 7 has no query engine binary; the adapter wraps node-postgres                                      |
| Auth        | **Auth.js v5** (`next-auth@5` beta)                        | Google, GitHub and email/password on one `User` row                                                       |
| Validation  | **Zod 4**                                                  | One schema per shape, imported by both the form and the route — client and server validation cannot drift |
| Styling     | **Tailwind CSS 4** + restyled shadcn/ui primitives         |                                                                                                           |
| Forms       | **React Hook Form** + `@hookform/resolvers`                |                                                                                                           |
| Drag & drop | **dnd-kit**                                                |                                                                                                           |
| Charts      | **Recharts 3**                                             | One chart. The other four visualisations are server-rendered HTML                                         |
| Storage     | **Supabase Storage** (private bucket)                      | Storage only — not auth, not application data                                                             |
| Tests       | **Vitest 5**                                               |                                                                                                           |
| Hosting     | **Vercel**                                                 |                                                                                                           |

Five external services in total: Neon, Supabase Storage, Google OAuth, GitHub OAuth, Vercel.
**There is no email provider** — nothing in the app sends mail.

---

## Architecture

```
src/
├── app/
│   ├── (auth)/              # login, register — no shell
│   ├── (app)/               # every authenticated page, behind one guard
│   ├── onboarding/          # the wizard, gated on onboardingCompleted
│   └── api/                 # Route Handlers
├── components/
│   ├── ui/                  # restyled primitives
│   ├── layout/ applications/ interviews/ … analytics/ notifications/
│   └── shared/              # empty states, confirm-delete, skeletons, pagination
├── server/                  # the ONLY place Prisma is imported
│   ├── db.ts                # client singleton
│   ├── auth.ts              # Auth.js config
│   ├── require-user.ts      # the only source of identity
│   ├── queries/             # reads
│   ├── mutations/           # writes
│   └── services/            # storage, notifications, resolvers, rate limiting
└── lib/
    ├── validations/         # Zod schemas, shared client + server
    ├── constants/ utils/ api/
```

Four rules the codebase holds to, because they are what keep it from rotting:

1. **Prisma is imported only inside `src/server/`.** Everything else goes through the query and
   mutation layers, which take `userId` as their first argument.
2. **Pages read; routes write.** A Server Component queries directly — no `fetch` to your own API.
   Route Handlers exist for client-side interactions and as the documented REST surface.
3. **Identity comes only from the session.** `requireUser()` / `requireApiUser()` are the only
   sources. No request schema has a `userId` field, so one cannot be smuggled in.
4. **Ownership lives in the `WHERE` clause**, never in a check beside it: `findFirst({ id, userId })`
   and `updateMany`/`deleteMany` scoped by `userId` with an affected-count check. A row belonging to
   someone else is a **404, never a 403** — a 403 confirms it exists.

Rule 4 has a 45-case test suite of its own (`tests/server/authorization.test.ts`) that runs two real
accounts against a real database and tries, for every entity, to read, update and delete the other
account's rows. Every denial is paired with proof the row was actually reachable by its owner —
otherwise "B gets 404" is trivially true for an id that does not exist.

---

## Data model

17 models. The ones that carry the product:

- **`User`** → **`Profile`** (one-to-one; the onboarding wizard's answers). Notification
  preferences are columns on `User` rather than their own table, since cutting email removed the
  per-channel settings that would have warranted one.
- **`Company`** is its own table, seeded and shared. A user-created company is private to them.
  Names are deduped on a normalised lowercase key, with a partial unique index keeping seeded names
  unique.
- **`Application`** is the hub, with `status`, `appliedAt` and `firstResponseAt` as the three
  columns every metric reads. It has six child relations: `ApplicationEvent`, `Interview`,
  `Assessment`, `Note`, `Task` and `ApplicationContact`.
- **`ApplicationEvent`** is an append-only log. `SAVED`, `APPLIED` and `STATUS_CHANGE` can only be
  written by the system — they cannot even be _named_ in a request, because the log is an analytics
  input and a hand-typed status change is a transition that never happened.
- **`Resume`** carries `deletedAt` for the soft delete, and `Application.resumeId` is `onDelete:
Restrict` so a resume that applications point at cannot vanish from under them.
- **`Notification`** has a `@@unique([userId, type, entityId])` that is load-bearing: it is what
  stops one interview generating a fresh notification on every page load, since generation is an
  upsert against it.
- **`RateLimit`** is a counter table with a composite primary key and no relations.

Two invariants worth knowing before you change anything:

- **`appliedAt IS NOT NULL ⟺ status ≠ SAVED`.** Both sides are maintained by
  `updateApplicationStatus`.
- **`completedAt IS NOT NULL ⟺ isCompleted`** on `Task`. Un-completing clears the timestamp.

Dates come in two kinds and mixing them up is the most likely bug in the codebase:
`lib/utils/date-only.ts` for calendar days (deadlines, due dates — stored midnight UTC, read back
UTC) and `lib/utils/date-time.ts` for instants (interviews — stored UTC, displayed in the user's
zone). Three real bugs in this project have come from the seam between them.

---

## Running it locally

### Prerequisites

- **Node 20.9 or newer** (Next 16's floor; built and tested on 22) and npm
- A **Neon** Postgres database (free tier is fine)
- A **Supabase** project, for the resume bucket
- **Google** and **GitHub** OAuth apps

### 1. Install

```bash
git clone <your-fork-url> careertrack
cd careertrack
npm install
```

`postinstall` runs `prisma generate`, so the client is built for you.

### 2. Configure

```bash
cp .env.example .env
```

Then fill it in. `.env.example` documents every variable; the short version:

| Variable                                | Where it comes from                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | Neon → your database → **pooled** connection string. Used by the app at runtime.                                                                        |
| `DIRECT_URL`                            | Neon → the same database → **direct** connection string. Used by `prisma migrate`, which needs session-level advisory locks that PgBouncer cannot hold. |
| `AUTH_SECRET`                           | `npx auth secret`                                                                                                                                       |
| `AUTH_URL`                              | `http://localhost:3000` in development                                                                                                                  |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID. Add the redirect URI `http://localhost:3000/api/auth/callback/google`.          |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub → Settings → Developer settings → OAuth Apps. Callback URL `http://localhost:3000/api/auth/callback/github`.                                     |
| `NEXT_PUBLIC_SUPABASE_URL`              | Supabase → Project Settings → Data API                                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | Supabase → API Keys. Safe in the browser.                                                                                                               |
| `SUPABASE_SECRET_KEY`                   | Supabase → API Keys. **Server only** — it bypasses every storage policy, so it must never carry a `NEXT_PUBLIC_` prefix.                                |
| `SUPABASE_RESUME_BUCKET`                | `resumes`                                                                                                                                               |

Both Neon URLs are needed and they are different strings. Pointing `DIRECT_URL` at the pooled
endpoint makes `prisma migrate` hang.

### 3. Create the storage bucket

Supabase projects start with no buckets, and this is the one setup step with no error message
pointing at it — uploads fail at the storage call. In the Supabase dashboard → **Storage** → **New
bucket**:

- Name: **`resumes`** (must match `SUPABASE_RESUME_BUCKET`)
- **Private** — not public. Downloads go through short-lived signed URLs after an ownership check.
- File size limit: **5 MB** (the app itself enforces 4 MB; see [Deployment](#deployment))
- Allowed MIME types: `application/pdf` and
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### 4. Migrate and seed

```bash
npm run db:deploy   # applies the 7 migrations
npm run db:seed     # inserts 484 companies — idempotent, safe to re-run
```

The seed is idempotent because it matches on the normalised name, so re-running it adds nothing and
a casing variant in the list could never become a second row.

Use `npm run db:migrate` (`prisma migrate dev`) only when you are _changing_ the schema.

### 5. Run

```bash
npm run dev
```

http://localhost:3000. Register with an email and password, or sign in with Google or GitHub, and
the onboarding wizard takes it from there.

### Scripts

| Script                            | Does                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Development server                                                                                    |
| `npm run build` / `start`         | Production build and serve                                                                            |
| `npm run check`                   | **typecheck + lint + format:check + test**, which is the gate every phase of this project had to pass |
| `npm run typecheck`               | `tsc --noEmit`                                                                                        |
| `npm run lint` / `lint:fix`       | ESLint                                                                                                |
| `npm run format` / `format:check` | Prettier                                                                                              |
| `npm test` / `test:watch`         | Vitest                                                                                                |
| `npm run db:migrate`              | `prisma migrate dev` — creates and applies a migration                                                |
| `npm run db:deploy`               | `prisma migrate deploy` — applies pending migrations, for CI and production                           |
| `npm run db:seed`                 | Seeds companies                                                                                       |
| `npm run db:studio`               | Prisma Studio                                                                                         |

---

## Testing

```bash
npm test
```

768 tests across 32 files. **Expect it to take around two minutes**, and that is not a problem to
fix: most of the time is one suite deliberately talking to a real database.

The suite is in two halves:

- **`tests/lib/`** — pure unit tests. Validation schemas, the date-only/instant split across a DST
  boundary, analytics arithmetic against hand-counted figures, file signature sniffing, rate-limit
  window maths, the open-redirect guard.
- **`tests/server/`** — database-backed, against real Postgres. The authorization suite, analytics
  over seeded rows, and the rate limiter, which is the one place a mocked client would be useless:
  the property that matters is atomicity under concurrency, so a test fires ten simultaneous calls
  at a limit of three and asserts exactly three are allowed.

Two things about the database-backed tests, since they run against the same database the app uses:

- Every fixture lives under a reserved `.invalid` email domain, and teardown selects on that domain.
  The `WHERE` clause is the guard — the same discipline the code under test follows.
- `vitest.config.mts` sets `fileParallelism: false`, because those suites share one database and
  parallel files would race on the same rows.

`testTimeout` is raised to 30 s and `hookTimeout` to 60 s. The 5 s default is a budget for pure
functions; the database-backed cases are deliberately sequential — set up a row, attack it, read it
back — and a case that trips the default looks exactly like a failing security test, which is the
worst false alarm a suite like that can produce.

---

## Deployment

Hosted on Vercel. Four things to get right.

**1. Environment variables.** Every variable from `.env` goes into Vercel → Project → Settings →
Environment Variables, with two changes:

- `AUTH_URL` becomes your production URL (`https://your-domain`), not `localhost`.
- `DATABASE_URL` should be the **pooled** Neon endpoint. Serverless functions open a connection per
  instance, and the direct endpoint will exhaust the connection limit.

**2. Production OAuth redirect URIs.** The dev URIs do not cover production, and the failure is an
opaque `invalid_client` at the provider rather than anything in your logs. Add, alongside the
existing ones:

- Google Cloud Console → Credentials → your OAuth client → Authorised redirect URIs:
  `https://your-domain/api/auth/callback/google`
- GitHub → Developer settings → your OAuth App → Authorization callback URL:
  `https://your-domain/api/auth/callback/github`

GitHub allows one callback URL per app, so production needs **its own OAuth App**, not another URL
on the development one.

**3. Migrations.** Run against production before or during the first deploy:

```bash
DIRECT_URL="<production direct url>" npm run db:deploy
npm run db:seed    # once, for the company list
```

`migrate deploy` only applies what is already in `prisma/migrations` — it never generates a
migration and never prompts, which is why it is the production command and `migrate dev` is not.

**4. The upload size cap is 4 MB, and the number is the platform's.** Vercel refuses a function's
request body over 4.5 MB _before the function runs_. The resume upload deliberately goes through our
own route so the MIME and magic-byte checks happen before a byte is stored, so the cap has to sit
under the platform's — otherwise a 4.6 MB PDF passes every local check and comes back from
production as Vercel's own 413, with none of our copy. It is one constant,
`RESUME_MAX_BYTES` in `src/lib/constants/resume.ts`, and every piece of UI copy quoting a size
derives from it.

---

## Security

| Risk                         | Defence                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IDOR**                     | Ownership in the `WHERE` clause. 404, never 403. There are exactly two `findUnique` calls in the codebase: by email during sign-in, and by session id in `require-user.ts`.                                                                                                                                                                                                        |
| **Client-supplied `userId`** | Ignored entirely. No request schema has the field.                                                                                                                                                                                                                                                                                                                                 |
| **Broken authorization**     | The `(app)` layout guards every page _and_ every Route Handler calls `requireApiUser()`. Both layers.                                                                                                                                                                                                                                                                              |
| **SQL injection**            | Prisma parameterises everything. The raw statements are DDL in migrations plus one parameterised rate-limit upsert.                                                                                                                                                                                                                                                                |
| **XSS**                      | No `dangerouslySetInnerHTML` anywhere. User-supplied URLs are validated as `http`/`https`, including inside deletion snapshots, so `javascript:` cannot reach an `href`.                                                                                                                                                                                                           |
| **Open redirect**            | `safeRedirectPath` reduces `callbackUrl` to a same-origin path. It strips the characters the URL parser deletes (tab, LF, CR — each of which otherwise turns `/x/evil.example` into a protocol-relative URL), resolves and compares origins, then re-checks the _result_, because `/..//evil.example` normalises into a protocol-relative path after passing the first two checks. |
| **Malicious uploads**        | MIME **and** magic-byte check, 4 MB cap, private bucket, server-generated storage paths with no user-supplied filename in them.                                                                                                                                                                                                                                                    |
| **Rate abuse**               | Postgres-backed limits on sign-in (5 / 15 min per email **and** IP), registration (3 / hour per IP), resume upload (20 / hour), application create (100 / hour) and autocomplete (60 / min).                                                                                                                                                                                       |
| **Data leakage**             | Errors are logged server-side and returned generic. No stack traces, no table names, no connection strings. Storage errors in particular are plain `Error`s on purpose, because their text contains a storage path that begins with the owner's user id.                                                                                                                           |
| **Password storage**         | bcryptjs, cost 12. Never logged, never returned, selected in exactly one place. A sign-in attempt for an address with no account burns the same ~250 ms a real comparison costs, so response time does not reveal which case it was.                                                                                                                                               |
| **Account linking**          | Auth.js default — no automatic linking on an unverified email, which blocks the takeover where someone signs up with your address on another provider.                                                                                                                                                                                                                             |

---

## Future work

Deliberately out of scope for this build, in rough order of what I would do next:

- **Password reset.** Cut from the initial build because it needs an email provider, which would add
  a sixth service and a custom domain. Adding one unblocks this and the next item together.
- **Email notifications.** The inbox is in-app only. The generation logic is already channel-neutral
  — it computes "what is due" and writes rows — so a second channel is a sender, not a rewrite.
- **Account deletion.** There is no flow for it, and whatever adds one has to delete the storage
  objects _first_: `Resume.user` is `onDelete: Cascade`, so removing the user would drop the rows and
  orphan every file in the bucket.
- **A dark theme.** The tokens exist and nothing sets `.dark`. Before shipping it, the dark chart
  palette needs fixing — `--chart-3` sits outside the lightness band and the tritan separation
  between adjacent series is 5.1, below where it should be. The light palette was validated
  properly: lightness band, chroma floor, colour-vision separation and 3:1 contrast.
- **Keyboard drag on the Kanban board.** There is currently no `KeyboardSensor` and no
  `TouchSensor`, which is intentional rather than an omission: the status dropdown is the accessible
  path in both views and it is not a fallback. Adding sensors would be an improvement; removing the
  dropdown would not.
- **Cursor pagination** for the applications list, if anyone ever reaches a page depth where
  `OFFSET` hurts. Measured: at 10 609 applications the deep-offset page is 0.77 ms, so this is not
  urgent.

Three things that are **not** planned, because they were considered and rejected:

- **An archive.** Cut from the product entirely. `WITHDRAWN` and `REJECTED` are statuses, the board
  shows them, and the filters hide them — an archive flag would be a second, overlapping way to say
  the same thing.
- **A three-dot menu on list rows.** Status is the frequent action and is already inline in both
  views; edit and delete are rare and live on the detail page. Delete from a list also cannot tell
  two identically-titled rows apart.
- **Redis for rate limiting.** One more hosted service to hold five counters that one table and one
  atomic statement already hold correctly.
