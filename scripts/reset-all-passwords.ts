// Bulk-set every auth user's password to a temp value. Dev / pre-launch
// only — never run against a real production install.
//
// Usage (from repo root):
//   npx tsx scripts/reset-all-passwords.ts
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// .env.local. Iterates auth users in 200-row pages and patches each
// password to TEMP_PASSWORD.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const TEMP_PASSWORD = "123456";

// Minimal .env.local parser — no extra deps.
function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Set them in .env.local or export them before running.",
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  let page = 1;
  let totalUpdated = 0;
  let totalFailed = 0;

  console.log(`Resetting every Supabase auth user's password to "${TEMP_PASSWORD}"…\n`);

  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`listUsers page ${page}:`, error.message);
      process.exit(1);
    }
    if (!data?.users?.length) break;

    for (const u of data.users) {
      const { error: updErr } = await sb.auth.admin.updateUserById(u.id, {
        password: TEMP_PASSWORD,
      });
      if (updErr) {
        totalFailed += 1;
        console.warn(`  ✕ ${u.email ?? u.id}: ${updErr.message}`);
      } else {
        totalUpdated += 1;
        console.log(`  ✓ ${u.email ?? u.id}`);
      }
    }

    if (data.users.length < 200) break;
    page += 1;
  }

  console.log(`\nUpdated ${totalUpdated} user(s). Failed: ${totalFailed}.`);
  console.log(`Every auth user can now sign in with: ${TEMP_PASSWORD}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
