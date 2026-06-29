-- Jarvis goal mission system migration.
-- Run this in Supabase SQL editor.

alter table goals
  add column if not exists mission_type text default 'objective',
  add column if not exists status text default 'active',
  add column if not exists start_date date null,
  add column if not exists due_date date null,
  add column if not exists planned_date date null,
  add column if not exists planned_time text null,
  add column if not exists period_start date null,
  add column if not exists period_end date null,
  add column if not exists streak_count integer default 0,
  add column if not exists success_count integer default 0,
  add column if not exists miss_count integer default 0,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table goal_logs
  add column if not exists log_type text default 'progress',
  add column if not exists planned_for date null,
  add column if not exists metadata jsonb default '{}'::jsonb;

create table if not exists goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  title text not null,
  description text null,
  status text default 'open',
  target_date date null,
  completed_at timestamptz null,
  cost numeric null,
  notes text null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists goal_milestones_goal_id_idx on goal_milestones(goal_id);

update goals
set
  mission_type = 'standard',
  category = 'Personal',
  goal_type = 'count',
  target_value = 1,
  unit = 'date',
  frequency = 'weekly',
  description = 'Take Tierra on one date weekly to keep the spice.',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"planned_day_support": true}'::jsonb
where lower(title) = '1 date weekly';

update goals
set
  mission_type = 'standard',
  category = 'Business',
  goal_type = 'count',
  target_value = 1,
  unit = 'module',
  frequency = 'daily'
where lower(title) in ('finish 1 training module a day', 'finish 1 training module daily');

update goals
set
  mission_type = 'standard',
  category = coalesce(nullif(category, ''), 'Jarvis'),
  goal_type = 'count',
  target_value = 3,
  unit = 'feature',
  frequency = 'weekly'
where lower(title) = 'ship 3 features weekly';

update goals
set
  mission_type = 'objective',
  category = 'Fitness',
  goal_type = 'metric',
  target_value = 200,
  unit = 'lbs'
where lower(title) = 'overhead press 200';

update goals
set
  mission_type = 'objective',
  category = 'Fitness',
  goal_type = 'metric',
  target_value = 315,
  unit = 'lbs'
where lower(title) = 'bench press 315';

update goals
set
  mission_type = 'objective',
  category = 'Fitness',
  goal_type = 'metric',
  unit = 'lbs'
where lower(title) in ('squat goal', 'deadlift goal');

update goals
set
  mission_type = 'project',
  category = 'Jarvis',
  goal_type = 'milestone',
  status = 'active',
  description = 'Build the physical Jarvis command center one upgrade at a time.',
  frequency = 'monthly',
  unit = 'milestone',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"monthly_cadence": "Buy approximately 1 Jarvis workstation part or upgrade per month."}'::jsonb
where lower(title) = 'build the jarvis workstation';

insert into goal_milestones (goal_id, title, status, sort_order)
select g.id, m.title, m.status, m.sort_order
from goals g
cross join (
  values
    ('GPU', 'complete', 0),
    ('CPU', 'open', 1),
    ('Motherboard', 'open', 2),
    ('RAM', 'open', 3),
    ('Storage', 'open', 4),
    ('Power Supply', 'open', 5),
    ('Case', 'open', 6),
    ('Cooling', 'open', 7),
    ('Monitor / Display upgrade', 'open', 8),
    ('UPS / power backup', 'open', 9),
    ('Microphone / audio input', 'open', 10),
    ('Desk or mounting upgrade', 'open', 11)
) as m(title, status, sort_order)
where lower(g.title) = 'build the jarvis workstation'
  and not exists (
    select 1
    from goal_milestones existing
    where existing.goal_id = g.id
      and lower(existing.title) = lower(m.title)
  );
