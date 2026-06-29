create table if not exists daily_debrief_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  date date not null,
  overall_status text not null default 'PARTIAL',
  mission_score integer null,
  daily_score integer null,
  weekly_score integer null,
  lifetime_score integer null,
  lifetime_rank text null,
  is_finalized boolean default false,
  completed_at timestamptz null,
  summary text null,
  objectives jsonb default '[]'::jsonb,
  training jsonb default '{}'::jsonb,
  nutrition jsonb default '{}'::jsonb,
  finance jsonb default '{}'::jsonb,
  victory jsonb default '{}'::jsonb,
  lessons jsonb default '{}'::jsonb,
  tomorrow jsonb default '{}'::jsonb,
  notes jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

create index if not exists idx_daily_debrief_entries_user_date
  on daily_debrief_entries(user_id, date desc);

comment on table daily_debrief_entries is
  'Daily Debrief journal snapshots including victory log, lessons learned, training, nutrition, finance, and tomorrow prep. Current app still supports JSON fallback.';
