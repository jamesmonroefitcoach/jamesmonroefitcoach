-- 0034: open-access link for a workout sheet
--
-- Adds an unguessable public_token to each workout_sheets row. It backs the
-- coach "Send" flow: James builds an at-home program (a sheet) and sends the
-- client an open, no-login URL (/s/<token>) where they fill in weights/notes
-- exactly like the PDF. The token scopes an unauthenticated read/write to that
-- one sheet; edits still flow into the paired program via the sheet↔program
-- bridge, so schedule + logs stay tied.

alter table workout_sheets
  add column if not exists public_token uuid;

-- Backfill existing rows with distinct tokens.
update workout_sheets set public_token = uuid_generate_v4() where public_token is null;

alter table workout_sheets alter column public_token set default uuid_generate_v4();

create unique index if not exists workout_sheets_public_token_idx
  on workout_sheets(public_token);

alter table workout_sheets alter column public_token set not null;
