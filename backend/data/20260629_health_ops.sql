create table if not exists health_event_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  icon text null,
  sort_order integer default 0,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists health_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  event_type text not null,
  occurred_at timestamptz not null default now(),
  event_date date not null default current_date,
  activity text null,
  duration text null,
  trigger text null,
  relief text null,
  severity text null,
  notes text null,
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_health_events_user_date
  on health_events(user_id, event_date desc);

create index if not exists idx_health_events_type
  on health_events(event_type);

create table if not exists health_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  checkin_date date not null,
  energy integer null check (energy between 1 and 5),
  mood integer null check (mood between 1 and 5),
  stress integer null check (stress between 1 and 5),
  sleep_quality integer null check (sleep_quality between 1 and 5),
  hours_slept numeric null,
  water_oz numeric null,
  caffeine_mg numeric null,
  workout_completed boolean null,
  meals_planned integer null,
  meals_completed integer null,
  ate_out boolean null,
  food_spend numeric null,
  training_notes text null,
  supplements text[] default '{}'::text[],
  medications jsonb default '{}'::jsonb,
  notes text null,
  source_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, checkin_date)
);

create table if not exists health_weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  week_start date not null,
  week_end date not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, week_start)
);

create table if not exists health_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  name text not null,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique(user_id, name)
);

insert into health_event_types(key, label, icon, sort_order)
values
  ('deep_breath_awareness', 'Deep Breath Awareness', 'lungs', 10),
  ('brain_fog', 'Brain Fog', 'brain', 20),
  ('forgetfulness', 'Forgetfulness', 'thought', 30),
  ('lightheaded', 'Lightheaded', 'dizzy', 40),
  ('heart_flutter', 'Heart Flutter', 'heart', 50),
  ('headache', 'Headache', 'headache', 60),
  ('diarrhea', 'Diarrhea', 'meal', 70),
  ('custom_event', 'Custom Event', 'plus', 999)
on conflict (key) do update set
  label = excluded.label,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into health_supplements(user_id, name)
values
  ('john', 'Creatine'),
  ('john', 'C4'),
  ('john', 'Vitamin D'),
  ('john', 'Magnesium Glycinate')
on conflict (user_id, name) do update set is_active = true;
