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
1. supabase/schema.sql                                        (core tables + James/Ryan seeded)
2. supabase/migrations/0002_program_and_schedule.sql          (exertion, duration, daily totals)
3. supabase/migrations/0003_storage.sql                       (progress-photos bucket)
4. supabase/migrations/0004_recurring_and_requests.sql        (recurring appointments, change-request history)
5. supabase/migrations/0005_program_kind.sql                  (in_gym vs at_home program types)
6. supabase/migrations/0006_equipment_exertion_prospects_reminders.sql  (equipment lists, prospect lifecycle, reminders)
7. supabase/import-clients.sql                                (loads all ~35 clients + prospects from your sheet)
```

After step 7 you should see a row like `total_clients: 27, total_monthly_revenue: ~8,000`.

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

When James adds new clients to the Numbers/Google Sheet, paste new rows into `supabase/import-clients.sql` (in the `INSERT INTO _stg_clients VALUES (...)` block) and re-run. The script is idempotent — existing clients are updated, new ones inserted.

**Columns in order:** `client_status, full_name, age_category, dire_need, priorities, trained_since, accountability, education, commitment, gender, regular_frequency, session_rate, starting_weight, current_weight, goal_weight, monthly_dollars, test_rate, net_increase, net_increase_month, gut_feel, time_window`

**Client status values:** `Current` → maps to `'current'` in DB; `Potential` → `'potential'`

**Rates guide:** Most in-gym clients are `$65`/session. Premium clients (Abbey, Elizabeth) are `$100`. Acacia, Katherine Sheppard, Keaton are `$70`. Rowland family package is separate (`$80` for Ragnar).

---

## 2. GitHub

### 2a. Create the repository (first time only)

1. Go to https://github.com/new
2. Owner: your account (or an org like `jamesmonroefitcoach`) · Repo name: `monroe-fit-coach`
3. **Private** (you don't want clients seeing source)
4. Skip the README — the repo has content already
5. Click **Create repository** and copy the HTTPS URL (e.g. `https://github.com/jamesmonroefitcoach/monroe-fit-coach.git`)

### 2b. Push the code

```bash
cd "/Users/ryanmecca/Monroe Fit Coach"
git remote add origin https://github.com/jamesmonroefitcoach/monroe-fit-coach.git
git push -u origin main
```

If the remote URL differs, swap it in above. All future pushes are just `git push`.

### 2c. Ongoing workflow

```bash
git add -p                      # stage changes interactively
git commit -m "what changed"
git push                        # triggers Vercel redeploy automatically
```

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

- [ ] `https://monroefitcoach.com/login` loads, shows James + all clients in the picker
- [ ] Pick James → coach dashboard shows hours / $ / clients / open requests
- [ ] `/coach/clients` lists all current clients with last-program + expiring flags
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
