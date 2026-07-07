-- Forge Work Sessions and shared-goal imports.
-- Copy/paste into Supabase SQL editor.

create table if not exists public.forge_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  task_id uuid null references public.forge_tasks(id) on delete set null,
  linked_goal_id uuid null references public.goals(id) on delete set null,
  session_type text not null default 'Continue Current Mission',
  title text not null,
  scratchpad text null,
  decisions text null,
  follow_up_task text null,
  convert_scratchpad_to_note boolean not null default false,
  mark_task_complete boolean not null default false,
  count_toward_goal boolean not null default false,
  status text not null default 'completed',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_sessions_status_check check (status in ('active', 'completed', 'cancelled'))
);

create index if not exists forge_sessions_user_id_idx
  on public.forge_sessions(user_id);

create index if not exists forge_sessions_project_id_idx
  on public.forge_sessions(project_id, completed_at desc);

create index if not exists forge_sessions_task_id_idx
  on public.forge_sessions(task_id);

create index if not exists forge_sessions_linked_goal_id_idx
  on public.forge_sessions(linked_goal_id);

create or replace function public.touch_forge_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_forge_sessions_updated_at on public.forge_sessions;
create trigger touch_forge_sessions_updated_at
before update on public.forge_sessions
for each row execute function public.touch_forge_sessions_updated_at();

-- Secure Internal AI Assistant shares the same workstation hardware dependency.
insert into public.forge_project_goal_links (user_id, project_id, goal_id, relationship_type, notes)
select
  p.user_id,
  p.id,
  g.id,
  'dependency',
  'Shared workstation hardware dependency. This project can keep moving, but final completion depends on the workstation build.'
from public.forge_projects p
join public.goals g
  on lower(g.title) = lower('Build the Jarvis Workstation')
where lower(p.title) in (
  lower('Chloe GF Build'),
  lower('Jarvis Life Command Center'),
  lower('Secure Internal AI Assistant')
)
on conflict (project_id, goal_id) do update
set
  relationship_type = excluded.relationship_type,
  notes = excluded.notes,
  updated_at = now();
