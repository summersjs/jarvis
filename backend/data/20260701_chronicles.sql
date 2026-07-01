-- The Archive: Chronicles
-- Copy/paste this file into the Supabase SQL editor.

create table if not exists public.archive_chronicles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  entry_date date not null default current_date,
  title text null,
  status text not null default 'draft',
  started_at timestamptz default now(),
  filed_at timestamptz null,
  daily_score numeric null,
  weekly_score numeric null,
  mission_rank text null,
  overall_status text null,
  workout_status text null,
  workout_summary text null,
  next_protocol text null,
  calories numeric null,
  protein_g numeric null,
  water_oz numeric null,
  sleep_hours numeric null,
  temperature text null,
  health_event_count integer null,
  deep_breath_event_count integer null,
  goal_impacts jsonb default '[]'::jsonb,
  victory_log text null,
  lessons_worked text null,
  lessons_not_worked text null,
  lessons_adjust_tomorrow text null,
  tomorrow_focus text null,
  story_text text null,
  future_me_message text null,
  notes text null,
  source_debrief_id uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, entry_date)
);

alter table public.archive_chronicles
  add column if not exists temperature text null;

alter table public.archive_chronicles
  alter column user_id set default 'john',
  alter column user_id set not null,
  alter column entry_date set default current_date,
  alter column entry_date set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column goal_impacts set default '[]'::jsonb,
  alter column goal_impacts set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'archive_chronicles_status_check'
  ) then
    alter table public.archive_chronicles
      add constraint archive_chronicles_status_check
      check (status in ('draft', 'in_progress', 'filed'));
  end if;
end $$;

create index if not exists archive_chronicles_user_id_idx
  on public.archive_chronicles (user_id);

create index if not exists archive_chronicles_entry_date_idx
  on public.archive_chronicles (entry_date desc);

create index if not exists archive_chronicles_status_idx
  on public.archive_chronicles (status);

create or replace function public.set_archive_chronicles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_archive_chronicles_updated_at on public.archive_chronicles;

create trigger set_archive_chronicles_updated_at
before update on public.archive_chronicles
for each row
execute function public.set_archive_chronicles_updated_at();
