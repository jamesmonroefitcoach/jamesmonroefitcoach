# SQL for Ryan — 2026-07-27 session

Per CLAUDE.md, all SQL goes through Ryan. Nothing below has been applied.
Run these in the Supabase SQL editor, in the order given. Each block is
independent; read the "why" before running, because two of them are
judgement calls rather than obvious cleanups.

Project: `knixmjpvdfmqpjwhkrgd` (Monroe Fit Coach).

---

## 1. Consolidate duplicate DM threads (recommended, run first)

**Why.** `message_threads` has a unique index on `(coach_id, client_id, topic)`.
Postgres treats nulls as distinct, so that index never constrained direct
message threads, which carry `topic = null`. Every "+ New message" click
inserted a brand new empty thread, and the client-side loader then errored on
finding several and inserted yet another. The code defect is fixed and
committed, so no *new* duplicates are being created, and both sides now resolve
to the same thread deterministically.

What remains is the mess already in the table: one client has 3 topic-null
threads that each hold real messages, so his history stays split until these are
merged. This block repoints the messages onto the oldest thread per coach/client
pair, drops the now-empty duplicates, and adds a partial unique index that
actually covers DM threads so the class of bug cannot come back.

```sql
begin;

-- 1. Repoint messages from duplicate DM threads onto the oldest thread for that pair.
update messages m
set thread_id = keep.id
from message_threads dup
join lateral (
  select k.id from message_threads k
  where k.topic is null and k.coach_id = dup.coach_id and k.client_id = dup.client_id
  order by k.created_at limit 1
) keep on true
where m.thread_id = dup.id and dup.topic is null and dup.id <> keep.id;

-- 2. Drop the duplicate DM threads (now empty).
delete from message_threads dup
where dup.topic is null
  and dup.id <> (
    select k.id from message_threads k
    where k.topic is null and k.coach_id = dup.coach_id and k.client_id = dup.client_id
    order by k.created_at limit 1
  );

-- 3. Make the constraint actually cover DM threads. The existing
--    (coach_id, client_id, topic) unique index can't, because nulls are distinct.
create unique index if not exists message_threads_dm_unique
  on public.message_threads (coach_id, client_id)
  where topic is null;

commit;
```

Sanity check afterward — should return zero rows:

```sql
select coach_id, client_id, count(*)
from message_threads
where topic is null
group by 1, 2
having count(*) > 1;
```

---

## 2. Clean up test rows left by this session (recommended)

**Why.** Verifying the delete flow and the deferred-creation change required
creating real programs through the UI. These are empty "Untitled program" rows
with no client value, and two are attached to real clients (Samantha Saenz), so
they would otherwise appear in that client's portal.

Prefer archiving over deleting, to match how program deletion now works in the
app. If any of these were already archived through the UI, the `update` simply
affects fewer rows.

```sql
begin;

update programs
set archived_at = now()
where id in (
  '779758a9-1884-4822-b06e-fe826e8c24fc',  -- Ryan Mecca, empty
  '774fa551-28b7-4585-9356-28388746847f',  -- Ryan Mecca, empty
  '03425b57-d6ed-46c7-adc7-d57f06670c29',  -- Samantha Saenz, empty
  '7d56b33d-5f9c-4e3b-9c3a-9dedeb9e5374'   -- Samantha Saenz, "ZZ TEST deferred at-home save"
)
and archived_at is null;

update workout_sheets
set status = 'archived'
where program_id in (
  '779758a9-1884-4822-b06e-fe826e8c24fc',
  '774fa551-28b7-4585-9356-28388746847f',
  '03425b57-d6ed-46c7-adc7-d57f06670c29',
  '7d56b33d-5f9c-4e3b-9c3a-9dedeb9e5374'
);

commit;
```

Two message test rows can also go, though they are harmless:

```sql
delete from messages where id = 'e9659ea9-4a3b-4d45-bd4e-ffce3b0a73c1';
delete from message_threads where id = 'dd48ab9b-79ce-4790-b8d4-d64fc9440bd1';
```

---

## 3. Sweep orphaned public links from historically deleted programs (judgement call)

**Why.** This is a pre-existing defect, now fixed in code but not in data. The
old `deleteDraftProgram` hard-deleted the `programs` row but only set
`program_id = null` on the paired sheet, leaving it `status = 'active'` with a
live `public_token`. So every program James deleted through the Build lobby
before this session left a working, client-editable public link behind. Anyone
holding one of those URLs can still open and edit the sheet.

**Look before you leap.** Run the select first. An orphaned sheet is not
automatically junk: a sheet with no `program_id` may simply be a standalone
sheet that was never attached to a program, and archiving those would take real
work away from James.

```sql
select id, client_id, status, public_token, created_at,
       jsonb_array_length(coalesce(sheet_data->'days', '[]'::jsonb)) as day_count
from workout_sheets
where program_id is null
  and status = 'active'
  and public_token is not null
order by created_at desc;
```

Decide per row. To close a specific one:

```sql
update workout_sheets set status = 'archived' where id = '<sheet id>';
```

---

## 4. Restore, if a program is ever archived by mistake

Program deletion in the app is a soft delete, so a mis-click is recoverable:

```sql
update programs set archived_at = null where id = '<program id>';
update workout_sheets set status = 'active' where program_id = '<program id>';
```

---

## Not SQL, but needs your decision

- **`lib/data.ts` `listCoachThreads` caps at `.limit(50)` against 54 threads**,
  ordered by thread `created_at`. Three real clients are currently absent from
  James's inbox entirely. Consolidating threads in §1 will mask this by dropping
  the row count, but the limit should still be raised or the ordering changed to
  last-message-time.
- **Announcement threads win the per-client collapse.** After a broadcast, every
  client's inbox row targets their announcement thread, but `/client/messages`
  only reads topic-null threads, so anything James types into one of those rows
  is invisible to the client. That is a "one database, both ways" break. Related:
  clients cannot see announcements at all today, though the Announce modal
  promises they land in each client's inbox. Fixing either way is a design call.
- **Deep links to an archived program still open the coach's builder**
  (`?program=<id>`). The client-facing link is dead, which is what was asked for.
  Whether James should be blocked from reopening his own deleted program is a
  product call.
