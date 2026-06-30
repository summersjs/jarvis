create table if not exists archive_dreams (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  title text,
  dream_text text,
  dream_prompt text,
  dream_date date,
  moon_phase text,
  people text[] default '{}'::text[],
  emotions text[] default '{}'::text[],
  settings text[] default '{}'::text[],
  symbols text[] default '{}'::text[],
  lucid text,
  recurring text,
  intensity integer,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_archive_dreams_user_date
  on archive_dreams(user_id, dream_date desc, created_at desc);

create or replace function set_archive_dreams_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists archive_dreams_set_updated_at on archive_dreams;

create trigger archive_dreams_set_updated_at
before update on archive_dreams
for each row
execute function set_archive_dreams_updated_at();
