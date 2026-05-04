# Monroe Fit Coach — Setup

End-to-end: from empty Supabase + Vercel accounts to a working site at `monroefitcoach.com`. Two passes: **Supabase first**, then **Vercel**.

---

## 1. Supabase

### 1a. Create the project

1. Go to https://supabase.com → "New project"
2. Name: `monroe-fit-coach` · Region: `us-east-1` (closest to Austin → Vercel) · Generate a strong DB password and save it in 1Password
3. Wait ~2 min for the project to provision

### 1b. Run the schema

In Supabase Dashboard → **SQL Editor** → New query, run these in order:

```
1. supabase/schema.sql               (core tables + James/Ryan seeded)
2. supabase/migrations/0002_program_and_schedule.sql   (exertion, duration, daily totals)
3. supabase/migrations/0003_storage.sql                (progress-photos bucket)
4. supabase/import-clients.sql       (loads the 19 clients from your sheet)
```

After step 4 you should see a row like `total_clients: 19, total_monthly_revenue: ~6,400`.

### 1c. Storage

`0003_storage.sql` already creates the `progress-photos` bucket.
Confirm: Dashboard → Storage → bucket `progress-photos` exists, is **private**.

### 1d. Grab your env values

Dashboard → Project Settings → API:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (don't ship to client)

Locally, copy `.env.local.example` → `.env.local` and paste them in.

```bash
cp .env.local.example .env.local
# fill in the two NEXT_PUBLIC_ values; service role optional for v1
npm run dev
```

The app **renders fine without Supabase** (demo data fallbacks). With env set, it reads from real tables.

### 1e. Re-running the client import as the sheet grows

When James adds new clients to the Google Sheet, paste the new rows into `supabase/import-clients.sql` (in the `INSERT INTO _stg_clients VALUES (...)` block) and re-run. The script is idempotent — existing clients are updated, new ones inserted.

---

## 2. GitHub

```bash
cd "/Users/ryanmecca/Monroe Fit Coach"
git remote add origin https://github.com/jamesmonroefitcoach/jamesmonroefitcoach.git
git push -u origin main
```

If the repo URL has a different spelling, swap it in.

---

## 3. Vercel

### 3a. Link the project

Easiest path (one-click):

1. Visit https://vercel.com/new → "Import Git Repository" → pick `jamesmonroefitcoach`
2. Framework: **Next.js** (auto-detected) · Root: `./` · Build cmd: `next build`
3. **Environment variables** — paste these three (from Supabase 1d):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (sensitive — Production only)
4. Deploy. First build ~2 min.

CLI alternative:

```bash
npm i -g vercel
vercel link        # picks up the project
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel --prod
```

### 3b. Custom domain

Project → Settings → Domains:

1. Add `monroefitcoach.com` and `www.monroefitcoach.com`
2. Vercel will tell you to set DNS records at your registrar:
   - Apex (`monroefitcoach.com`): `A` record → `76.76.21.21`
   - WWW: `CNAME` → `cname.vercel-dns.com`
3. SSL provisions automatically once DNS resolves (5–30 min).

### 3c. Preview deploys

Every git push to `main` ships to production. Pushes to other branches get a preview URL — share with James to gut-check before merging.

---

## 4. After it's live

Sanity checklist:

- [ ] `https://monroefitcoach.com/login` loads, shows James + 19 clients in the picker
- [ ] Pick James → coach dashboard shows hours / $ / clients / open requests
- [ ] `/coach/clients` lists 19 with last-program + expiring flags
- [ ] `/coach/build-program` lets you pick a client, add days, search the library, and Publish (writes a `programs` row + `program_days` + `program_movements`)
- [ ] `/coach/schedule` — click a blank cell to schedule, click an event to edit/cancel/delete; toggle Month view
- [ ] `/coach/messages` — pick a thread and send; "+ Announce" broadcasts to a tier or all
- [ ] Pick a client profile → `/client` shows an upcoming session with Reschedule/Cancel buttons
- [ ] `/client/check-ins` — submit a check-in (writes a row, photos upload to Storage)
- [ ] Pick admin → `/admin` shows pending sign-ups; Approve creates a `profiles` + `client_details` row
- [ ] Public sign-up at `/signup` lands as a row in `account_requests`

---

## 5. Things deferred (and where to wire them)

These are scoped but not yet implemented; clearly marked in code:

- **Real auth (Supabase magic link)** — login is currently a profile-picker setting a `mfc_session` cookie ([lib/types.ts](lib/types.ts), [app/api/sign-in/route.ts](app/api/sign-in/route.ts)). When you're ready: enable Email provider in Supabase Auth, replace `lib/session.ts` with `auth.getUser()`, and gate `setSessionCookie` to admin only.
- **SMS notifications** — change requests currently flip `appointments.status = 'change_requested'`. Hook a Supabase database webhook → Twilio when this transition fires.
- **RLS policies** — the schema has `auth.users`-style FKs ready, but no policies yet. Add them in the same migration that wires real auth.
- **Drag/drop polish in build-program** — currently arrow buttons reorder. Swap in `@dnd-kit/core` when ready.

---

## 6. Useful commands

```bash
npm run dev               # local dev (port 3000)
npm run build             # production build (run before deploying via CLI)
npx tsc --noEmit          # type-check only
```

Supabase CLI (optional, for migration version control):

```bash
npm i -g supabase
supabase login
supabase link --project-ref <ref>
supabase db push          # applies migrations/*.sql in order
```

---

## 7. Troubleshooting

- **Pages render but show demo data after env is set** — restart the dev server; env is read at boot.
- **`profiles` insert errors on approve** — likely a duplicate email; the table has `email unique`.
- **Photos upload but 404 on view** — bucket is private; in v1 we generate signed URLs (not yet wired into UI). Until then check the file in Supabase Dashboard → Storage.
- **`appointments_with_names` view missing** — re-run `schema.sql`; the view is at the bottom.
