# Monroe Fit Coach — Launch Checklist

End-to-end from a fresh machine to a live site at `monroefitcoach.com`.
Work top to bottom — each section depends on the one before it.

---

## ✅ Step 1 — Local smoke test (no database needed)

```bash
cd "/Users/ryanmecca/Monroe Fit Coach"
npm install
npm run dev
```

Open http://localhost:3000. The app runs on **demo data** until Supabase is connected — every page should load without errors. Pick "James Monroe" at the login screen to see the coach dashboard.

If `npx tsc --noEmit` comes back clean, you're good to move on.

---

## ✅ Step 2 — Create the Supabase project

1. Go to https://supabase.com → **New project**
2. Name: `monroe-fit-coach`
3. Region: **US East (N. Virginia)** — closest to Vercel's default region
4. Generate a strong DB password and **save it in 1Password** (you won't need it often, but you will need it)
5. Wait ~2 min for the project to provision (the spinner on the dashboard will stop)

---

## ✅ Step 3 — Run the SQL scripts in order

Open **Supabase Dashboard → SQL Editor → New query**.
Paste each file's contents and click **Run** before moving to the next.
All scripts are idempotent — safe to re-run if something goes wrong.

| # | File | What it does |
|---|------|-------------|
| 1 | `supabase/schema.sql` | Core tables, enums, views — also seeds James & Ryan as profiles |
| 2 | `supabase/migrations/0002_program_and_schedule.sql` | Exertion column, movement logs, session program override, daily-totals view |
| 3 | `supabase/migrations/0003_storage.sql` | Creates the `progress-photos` storage bucket |
| 4 | `supabase/migrations/0004_recurring_and_requests.sql` | Recurring appointment series, change-request history table |
| 5 | `supabase/migrations/0005_program_kind.sql` | `in_gym` vs `at_home` program type enum |
| 6 | `supabase/migrations/0006_equipment_exertion_prospects_reminders.sql` | Equipment lists, prospect lifecycle, coach reminders |
| 7 | `supabase/migrations/0007_intake_form.sql` | `form_received_at` + `form_data` columns on `client_details` |
| 8 | `supabase/import-clients.sql` | Loads all ~35 clients + prospects from the sheet |
| 9 | `supabase/migrations/0008_seed_historical_sessions.sql` | Historical completed+paid sessions + blank "Historical Sessions" programs |
| 10 | `supabase/migrations/0009…0034` — **every remaining file, in filename order** | Goals + growth plan, testimonials, consultations, workout sheets + public tokens, program day logs, auth linking, the programs↔sheets bridge, cancel-reason text conversion, and more. A fresh install is incomplete without all of them. |

**After step 8** you should see something like:
```
total_clients: 35   assigned_to_coach: 27   total_monthly_revenue: ~8000
```

**After step 9** you should see something like:
```
historical_programs: 27   completed_paid_appts: 300+
```
If those numbers look right, the database is fully populated.

---

## ✅ Step 4 — Confirm storage bucket

Dashboard → **Storage** — you should see a bucket named `progress-photos` marked **Private**.
If it's missing, re-run `0003_storage.sql`.

---

## ✅ Step 5 — Grab your Supabase env values

Dashboard → **Project Settings → API**:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" key — keep this secret, never commit it |

Copy `.env.local.example` → `.env.local` and paste the values in:

```bash
cp .env.local.example .env.local
# open .env.local and fill in all three values
```

Restart the dev server (`Ctrl-C`, then `npm run dev`) — it now reads from your real database.

---

## ✅ Step 6 — Local test with real data

With the env vars set, walk through these quick checks:

- [ ] **Login page** — pick James → lands on coach dashboard
- [ ] **Dashboard** — stats show real client count + this-week sessions; the three collapsible banners (Sessions This Week, Client Programs, No Sessions This Week) appear above the table
- [ ] **Clients list** (`/coach/clients`) — ~27 active clients visible, each with a rate, weight, and program status
- [ ] **Client profile** (`/coach/clients/<id>`) — Goals/profile and Intake Form cards side by side; Past sessions list shows historical records marked paid
- [ ] **Build Program → Session tab** — picker shows client card + session dropdown + Sessions This Week banner; after picking a session the builder opens with the session date as the card title, no Add Day button
- [ ] **Build Program → Program tab** — Client Programs banner at top; picker flow (client → details form → builder) works; Add Day button present
- [ ] **Schedule** (`/coach/schedule`) — week grid renders; click a blank slot to schedule; click an event to edit/cancel
- [ ] **Messages** (`/coach/messages`) — thread list loads; can compose + send
- [ ] **Admin** (`/admin`) — pending sign-up requests visible

If anything shows demo data instead of real data, restart the dev server — env vars are read at boot.

---

## ✅ Step 7 — Push to GitHub

### First time only — create the repo

1. Go to https://github.com/new
2. Owner: your account · Repo name: `monroe-fit-coach` · **Private**
3. Skip README (the repo already has content)
4. Copy the HTTPS URL (e.g. `https://github.com/jamesmonroefitcoach/monroe-fit-coach.git`)

```bash
cd "/Users/ryanmecca/Monroe Fit Coach"
git remote add origin https://github.com/jamesmonroefitcoach/monroe-fit-coach.git
git push -u origin main
```

All future deploys are just:
```bash
git add -p
git commit -m "describe what changed"
git push        # Vercel picks this up and redeploys automatically
```

---

## ✅ Step 8 — Deploy to Vercel

### Option A — One-click (recommended)

1. Go to https://vercel.com/new → **Import Git Repository**
2. Pick `jamesmonroefitcoach/monroe-fit-coach`
3. Framework: **Next.js** (auto-detected) · Root: `./`
4. Expand **Environment Variables** and add all three from Step 5:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → set scope to **Production** only
5. Click **Deploy** — first build takes ~2 min

### Option B — CLI

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY   # production only
vercel --prod
```

---

## ✅ Step 9 — Connect the custom domain

Vercel project → **Settings → Domains**:

1. Add `monroefitcoach.com`
2. Add `www.monroefitcoach.com`
3. Vercel gives you two DNS records — set these at your registrar (GoDaddy, Namecheap, etc.):

| Type | Name | Value |
|------|------|-------|
| A | `@` (apex) | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

DNS propagates in 5–30 min. SSL provisions automatically once it resolves.
Check https://monroefitcoach.com — it should show the login page over HTTPS.

---

## ✅ Step 10 — Final live sanity check

Run through each of these on the **live** URL (`https://monroefitcoach.com`):

- [ ] Login page loads; pick James; lands on dashboard
- [ ] Dashboard stat cards show correct client count + revenue
- [ ] "Sessions This Week" banner collapses/expands; "Needs Programming" links go to the right build-program URL
- [ ] "Client Programs" banner shows active programs with days-remaining; "Needs Program" links open the program builder for that client
- [ ] "No Sessions This Week" banner shows clients with no appointments this week as pill links
- [ ] `/coach/clients` — full client list loads; click a client, see their profile
- [ ] Client profile — Intake Form section shows "No form received" for most; Goals/profile section correct
- [ ] Client profile — Past sessions section shows historical completed+paid sessions
- [ ] `/coach/build-program` Sessions tab — pick a client, pick a session, click **Build →**; builder opens with session date/time as the card title; exercise library works; no "Add Day" button
- [ ] `/coach/build-program` Program tab — Client Programs banner at top; full picker → form → builder flow works; **Add Day** button present; Publish saves to Supabase
- [ ] `/coach/schedule` — week and month views load; create/edit/cancel an appointment
- [ ] `/coach/messages` — compose and send a message
- [ ] `/client` — log in as a client; upcoming session visible with Reschedule/Cancel
- [ ] `/client/check-ins` — submit a check-in with a photo; row appears in Supabase → `check_ins` table, photo in Storage
- [ ] `/signup` — fill out public signup form; row appears in Supabase → `account_requests`
- [ ] `/admin` — approve the signup; `profiles` + `client_details` row created

---

## 🔮 Things wired up but not yet live (round 2)

These are fully scoped — just flip the switch when you're ready:

| Feature | What's needed |
|---------|--------------|
| **Real auth (magic link)** | Enable Email provider in Supabase Auth → replace cookie-based session in `lib/session.ts` with `auth.getUser()` |
| **SMS notifications** | Add a Supabase database webhook on `appointments.status = 'change_requested'` → Twilio |
| **RLS row-level security** | Schema has `auth.uid()` FKs ready — add policies in the same migration that wires real auth |
| **Intake form import** | Paste client's Google Form responses into `client_details.form_data` (jsonb) + set `form_received_at` — the UI already renders them |
| **Real appointment history** | Historical sessions are seeded as a placeholder — replace with actual past dates once James exports them from his calendar/spreadsheet |
| **Drag-and-drop reorder** | Arrow buttons work today — swap in `@dnd-kit/core` for smoother UX when ready |

---

## 🛠 Useful day-to-day commands

```bash
npm run dev           # local dev server on port 3000
npm run build         # production build check — run before pushing if unsure
npx tsc --noEmit      # type-check only (fast)
git push              # deploy to production via Vercel
```

**Adding new clients** — paste new rows into `supabase/import-clients.sql` (the `INSERT INTO _stg_clients VALUES (...)` block) and re-run in Supabase SQL Editor. Existing clients are updated, new ones inserted, nothing is deleted.

**Re-seeding historicals after adding clients** — re-run `0008_seed_historical_sessions.sql`. It's idempotent — won't duplicate existing appointments.

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---------|-----|
| Pages show demo data after setting env | Restart the dev server — env vars load at boot |
| `profiles` insert error on approve | Duplicate email — check `profiles` table for existing row with that email |
| Photos upload but show 404 | Bucket is private; signed URL generation not yet wired into UI — view files directly in Supabase Dashboard → Storage |
| `appointments_with_names` view missing | Re-run `schema.sql` — the view is at the bottom of the file |
| Historical sessions not appearing | Check that `import-clients.sql` ran first (needs profiles rows), then re-run `0008_seed_historical_sessions.sql` |
| Build error on Vercel | Run `npm run build` locally first to catch it before pushing |
