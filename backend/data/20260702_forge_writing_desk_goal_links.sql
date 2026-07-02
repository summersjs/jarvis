-- Forge Writing Desk, two-level folders, and shared project-goal links.
-- Safe to paste into Supabase; it only adds missing structures/columns.

create table if not exists public.forge_project_goal_links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  relationship_type text not null default 'dependency',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, goal_id)
);

create index if not exists forge_project_goal_links_user_id_idx
on public.forge_project_goal_links(user_id);

create index if not exists forge_project_goal_links_project_id_idx
on public.forge_project_goal_links(project_id);

create index if not exists forge_project_goal_links_goal_id_idx
on public.forge_project_goal_links(goal_id);

alter table public.forge_sparks
add column if not exists folder_path text[] not null default '{}';

alter table public.forge_notes
add column if not exists folder_path text[] not null default '{}';

create index if not exists forge_sparks_folder_path_idx
on public.forge_sparks using gin(folder_path);

create index if not exists forge_notes_folder_path_idx
on public.forge_notes using gin(folder_path);

-- Make existing note/spark folders deterministic from known tags where possible.
update public.forge_notes
set folder_path = array['Characters', 'Lucien']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('lucien'));

update public.forge_notes
set folder_path = array['Characters', 'Aldric']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('aldric'));

update public.forge_notes
set folder_path = array['Characters', 'Liora']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('liora'));

update public.forge_notes
set folder_path = array['Game Design']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('gdd', 'project-bible', 'design-pillars'));

update public.forge_notes
set folder_path = array['Story']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('story', 'act-structure', 'opening-cinematic'));

update public.forge_notes
set folder_path = array['Systems']
where coalesce(array_length(folder_path, 1), 0) = 0
  and exists (select 1 from unnest(tags) tag where lower(tag) in ('class-system', 'guild-system', 'combat', 'artifacts', 'limit-break'));

-- Link Build the Jarvis Workstation as a dependency/shared milestone for projects
-- that depend on the same hardware, while preserving the actual Hardware project.
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
where lower(p.title) in (lower('Chloe GF Build'), lower('Jarvis Life Command Center'))
on conflict (project_id, goal_id) do update
set
  relationship_type = excluded.relationship_type,
  notes = excluded.notes,
  updated_at = now();
