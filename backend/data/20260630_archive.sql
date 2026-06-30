-- The Archive: Dream Journal storage
-- Copy/paste this file into the Supabase SQL editor.

create table if not exists public.archive_dreams (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  title text null,
  dream_text text null,
  dream_prompt text null,
  dream_date date not null default current_date,
  moon_phase text null,
  people text[] not null default '{}',
  emotions text[] not null default '{}',
  settings text[] not null default '{}',
  symbols text[] not null default '{}',
  lucid text null,
  recurring text null,
  intensity integer null,
  notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

update public.archive_dreams
set dream_date = current_date
where dream_date is null;

alter table public.archive_dreams
  alter column user_id set default 'john',
  alter column user_id set not null,
  alter column dream_date set default current_date,
  alter column dream_date set not null,
  alter column people set default '{}',
  alter column people set not null,
  alter column emotions set default '{}',
  alter column emotions set not null,
  alter column settings set default '{}',
  alter column settings set not null,
  alter column symbols set default '{}',
  alter column symbols set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'archive_dreams_lucid_check'
  ) then
    alter table public.archive_dreams
      add constraint archive_dreams_lucid_check
      check (lucid is null or lucid in ('Yes', 'No', 'Maybe'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'archive_dreams_recurring_check'
  ) then
    alter table public.archive_dreams
      add constraint archive_dreams_recurring_check
      check (recurring is null or recurring in ('Yes', 'No', 'Unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'archive_dreams_intensity_check'
  ) then
    alter table public.archive_dreams
      add constraint archive_dreams_intensity_check
      check (intensity is null or intensity between 1 and 5);
  end if;
end $$;

create index if not exists archive_dreams_user_id_idx
  on public.archive_dreams (user_id);

create index if not exists archive_dreams_dream_date_idx
  on public.archive_dreams (dream_date desc);

create or replace function public.set_archive_dreams_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_archive_dreams_updated_at on public.archive_dreams;

create trigger set_archive_dreams_updated_at
before update on public.archive_dreams
for each row
execute function public.set_archive_dreams_updated_at();
